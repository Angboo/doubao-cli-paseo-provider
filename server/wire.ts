export class DoubaoError extends Error {
  constructor(
    message: string,
    public readonly code: string = "DOUBAO_ERROR",
  ) {
    super(message);
    this.name = "DoubaoError";
  }
}
