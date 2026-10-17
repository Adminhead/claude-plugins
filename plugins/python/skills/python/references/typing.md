# Typing patterns

Read this before adding generics, protocols, callable types or type aliases, or before tightening mypy or pyright strictness. Match the syntax to `requires-python`: PEP 695 (`class Box[T]:`, `type Alias = ...`) needs 3.12, `X | Y` in runtime expressions needs 3.10, and `TypeIs` needs 3.13 (or `typing_extensions`).

Adapted from wshobson/agents `python-type-safety` (MIT License).

## Narrowing

The checker narrows on `is None`, `isinstance`, truthiness, `match`, and early `return`/`raise`. Narrow once at the top of a function and keep the rest typed:

```python
def display_name(user_id: str) -> str:
    user = find_user(user_id)  # User | None
    if user is None:
        raise UserNotFoundError(user_id)
    return user.name  # User here
```

- A list comprehension with `if x is not None` narrows `list[T | None]` to `list[T]`.
- For a custom check, return `TypeIs[T]` (narrows both branches) rather than `TypeGuard[T]` (narrows only the true branch) when the input type is a supertype of `T`.
- `assert x is not None` narrows too, but disappears under `python -O`. Use it for invariants, not for input validation.

## Generics

Use a type variable when the output type depends on the input type. Bound it when the body needs an attribute:

```python
# 3.12+
def first_valid[T: BaseModel](items: Sequence[T]) -> T | None: ...

class Repository[T: BaseModel]:
    async def get(self, id: str) -> T | None: ...

# 3.9-3.11
T = TypeVar("T", bound=BaseModel)

def first_valid(items: Sequence[T]) -> T | None: ...

class Repository(Generic[T]):
    async def get(self, id: str) -> T | None: ...
```

- A type variable that appears only once in a signature adds nothing; use the bound type directly.
- Prefer `Sequence[T]` or `Iterable[T]` for inputs so callers can pass tuples and generators; `list` is invariant, so `list[Cat]` doesn't fit `list[Animal]`.
- `ParamSpec` (`def retry[**P, R](fn: Callable[P, R]) -> Callable[P, R]`) keeps a decorator's wrapped signature instead of collapsing it to `Callable[..., Any]`.

## Protocols

Use a `Protocol` when callers supply their own implementation and shouldn't inherit from your base class, for example a repository, clock, or logger injected for testing.

```python
class Clock(Protocol):
    def now(self) -> datetime: ...
```

- Keep protocols small: the methods the consumer calls, nothing more.
- `@runtime_checkable` lets `isinstance` work but checks only that method names exist, not their signatures. Don't rely on it for validation.
- An ABC is the better fit when you own every implementation and want shared code or enforced registration.

## Callables and aliases

```python
ProgressCallback = Callable[[int, int], None]
AsyncHandler = Callable[[Request], Awaitable[Response]]

class OnProgress(Protocol):  # keyword arguments or defaults need a callback protocol
    def __call__(self, current: int, total: int, *, message: str = "") -> None: ...

type JsonValue = str | int | float | bool | None | list[JsonValue] | dict[str, JsonValue]  # 3.12+
JsonDict: TypeAlias = dict[str, "JsonValue"]  # 3.10-3.11
```

- Import `Callable`, `Awaitable`, `Iterable`, `Sequence` and `Mapping` from `collections.abc`, not `typing`.
- Name an alias for a shape that repeats or carries meaning (`UserId = NewType("UserId", str)` when mixing IDs is a real bug risk).

## Data shapes

- `TypedDict` for dict-shaped data you don't own (JSON payloads, kwargs); `NotRequired[...]` for optional keys.
- `@dataclass(frozen=True, slots=True)` for internal value objects.
- Pydantic models where the repo already uses them for validation at a boundary.
- `Literal["a", "b"]` or an `Enum` for a closed set of strings, not bare `str`.
- `Final` for module constants that must not be rebound, `@override` (3.12, or `typing_extensions`) on methods that override a parent.

## Strictness

Turn strictness up incrementally rather than flipping it for the whole codebase:

```toml
[tool.mypy]
strict = true
warn_unused_ignores = true

[[tool.mypy.overrides]]
module = ["legacy.*"]
strict = false

[[tool.mypy.overrides]]
module = ["untyped_vendor_lib.*"]
ignore_missing_imports = true
```

- `strict = true` already turns on `disallow_untyped_defs`, `warn_return_any`, `no_implicit_reexport` and the rest. Don't list them again.
- Pyright: `typeCheckingMode = "strict"` under `[tool.pyright]`, with `strict = ["pkg/new_module"]` or per-file `# pyright: strict` to scope it.
- `warn_unused_ignores` (mypy) and `reportUnnecessaryTypeIgnoreComment` (pyright) keep suppressions from outliving their reason.
- Check installed stubs (`types-*` packages, `py.typed` in the dependency) before adding `ignore_missing_imports`.
- Run the checker the project uses; mypy and pyright disagree on edge cases, so a fix for one can fail the other.
