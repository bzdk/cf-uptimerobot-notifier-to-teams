import { describe, expect, it } from "vitest"
import worker from "../src"

describe("worker entrypoint", () => {
  it("exports fetch and scheduled handlers", () => {
    expect(typeof worker.fetch).toBe("function")
    expect(typeof worker.scheduled).toBe("function")
  })
})
