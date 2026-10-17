# Threads and background work

Running expensive work off the main thread without corrupting the scene tree: the thread-safety rules, `WorkerThreadPool`, a long-lived `Thread` worker, handing results back, and threaded resource loading. C# `Task` and `async` rules are in `godot-csharp`.

Profile first (`references/performance.md`). Spreading cheap work across threads is often slower than a plain loop, and many "slow" frames are fixed by caching or spreading work over frames instead.

Contents: Safety rules (from the official thread-safe APIs page); WorkerThreadPool (default choice); Long-lived worker: Thread + Semaphore; Handing results back; Threaded resource loading.

## Safety rules (from the official thread-safe APIs page)

- The active scene tree is **not** thread-safe. Never read or write live nodes from a worker. Copy the data you need before the job, compute on the copy, and hand results back with `call_deferred` / `set_deferred`.
- You may build a node subtree off-tree in a worker and add it on the main thread with `add_child.call_deferred(node)`. Use one loader thread for this; several threads touching the same cached resource can crash.
- Physics servers are thread-safe only with `physics/2d/run_on_separate_thread` or `physics/3d/run_on_separate_thread` enabled.
- Instancing rendering nodes off the main thread needs `rendering/driver/threads/thread_model` set to Separate, which the docs mark experimental with known crash bugs. Avoid it in production.
- Avoid GPU work in workers (creating textures, reading or modifying image data on the GPU): it forces a sync with the RenderingServer and stalls.
- `NavigationServer2D/3D` queries are thread-safe. `AStar2D`, `AStar3D` and `AStarGrid2D` are not: use one object per thread.
- `Array` / `Dictionary`: changing existing elements from several threads works, but anything that resizes (append, erase, insert) needs a `Mutex`. Even `counter += 1` on a shared member is a read-modify-write; lock it.
- Don't mutate one `Resource` instance from several threads at once.
- Don't `await` signals or coroutines inside a thread body; defer back to the main thread first.

## WorkerThreadPool (default choice)

```gdscript
var _inputs: PackedVector2Array      # snapshot taken on the main thread
var _results: PackedFloat32Array     # pre-sized, one slot per element

func _job(i: int) -> void:           # runs on workers; writes only its own slot
	_results[i] = expensive(_inputs[i])

func run_batch() -> void:
	_results.resize(_inputs.size())
	var id := WorkerThreadPool.add_group_task(_job, _inputs.size())
	# ... other main-thread work ...
	WorkerThreadPool.wait_for_group_task_completion(id)
	apply(_results)                   # back on the main thread
```

- `add_task(callable)` runs one job; `add_group_task(callable, count)` calls it once per index across the pool threads.
- **Every task must be waited on** (`wait_for_task_completion` / `wait_for_group_task_completion`), or its resources leak. Poll with `is_task_completed(id)` / `is_group_task_completed(id)` when you can't block, and still call the wait once it reports done.
- Keep the element count and the input array unchanged while the group runs.
- Don't wait on a pool task from inside another pool task; it can deadlock (`wait_for_task_completion` returns `ERR_BUSY`).

## Long-lived worker: Thread + Semaphore

```gdscript
var _thread := Thread.new()
var _sem := Semaphore.new()
var _mutex := Mutex.new()
var _quit := false
var _queue: Array = []

func _ready() -> void:
	_thread.start(_loop)

func push(job: Variant) -> void:
	_mutex.lock(); _queue.append(job); _mutex.unlock()
	_sem.post()

func _loop() -> void:
	while true:
		_sem.wait()
		_mutex.lock()
		var quit := _quit
		var job: Variant = null if _queue.is_empty() else _queue.pop_front()
		_mutex.unlock()
		if quit: return
		if job != null:
			var out: Variant = work(job)
			_deliver.call_deferred(out)   # main thread receives it

func _exit_tree() -> void:
	_mutex.lock(); _quit = true; _mutex.unlock()
	_sem.post()                 # wake it so it sees _quit
	_thread.wait_to_finish()    # always join before the node is freed
```

- `Thread.start(callable, priority)`, `is_alive()`, `wait_to_finish()`. Freeing a `Thread` that was never joined triggers an engine warning and leaves the work unfinished; always call `wait_to_finish()`.
- Creating threads is slow (notably on Windows); start workers before the heavy phase, not per frame.
- `Mutex` is reentrant. Keep critical sections short, and when taking several mutexes always take them in the same order.

## Handing results back

- `node.add_child.call_deferred(child)`, `label.set_deferred("text", s)`, `some_signal.emit.call_deferred(value)`.
- Deferred calls run at idle time at the end of the current frame on the main thread.

## Threaded resource loading

```gdscript
const LEVEL := "res://levels/level_2.tscn"
var _progress: Array = []

func start_load() -> void:
	ResourceLoader.load_threaded_request(LEVEL)
	set_process(true)

func _process(_dt: float) -> void:
	match ResourceLoader.load_threaded_get_status(LEVEL, _progress):
		ResourceLoader.THREAD_LOAD_IN_PROGRESS:
			$Bar.value = _progress[0] * 100.0
		ResourceLoader.THREAD_LOAD_LOADED:
			set_process(false)
			get_tree().change_scene_to_packed(ResourceLoader.load_threaded_get(LEVEL))
		_:   # THREAD_LOAD_FAILED or THREAD_LOAD_INVALID_RESOURCE
			set_process(false)
			push_error("load failed: %s" % LEVEL)
```

- Poll status before `load_threaded_get()`: called early, it blocks the main thread like `load()`.
- Call `load_threaded_get()` once per request; the path stays the key for status queries.
- 4.7: several threaded-load deadlock, race and leak fixes landed with no API change. Re-test old workarounds for rare load hangs before keeping them (unverified against the 4.7 changelog).
