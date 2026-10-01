// Tie priority between overlapping matches of equal length, in order.
export type Source = 'registered' | 'vault' | 'env' | 'custom' | 'openredaction'
export type Match = { start: number; end: number; category: string; source: Source }
export type Detector = {
  source: Source
  detect(text: string): Match[]
}
export type Found = { id: string; value: string; category: string }
export type Lookup = (id: string) => string | undefined
