import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Structural guards for mistakes that are invisible at runtime until they
 * matter. The first one is not hypothetical: middleware.ts sat at the repo
 * root for the whole build and never ran, because Next.js only loads it from
 * `src/` when the app lives in `src/`. It was only caught by running the
 * production build in Docker.
 */
describe("project structure", () => {
  it("loads middleware from src/ when the app router lives in src/app", () => {
    if (!existsSync("src/app")) return; // only applies to src-dir layouts
    expect(existsSync("src/middleware.ts")).toBe(true);
    expect(existsSync("middleware.ts")).toBe(false);
  });

  it("keeps secrets out of version control and out of the Docker context", () => {
    const gitignore = readFileSync(".gitignore", "utf8");
    expect(gitignore.split("\n")).toContain(".env");
    const dockerignore = readFileSync(".dockerignore", "utf8");
    expect(dockerignore.split("\n")).toContain(".env");
  });

  it("never ships a real key in the example env file", () => {
    const example = readFileSync(".env.example", "utf8");
    expect(example).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/);
    expect(example).not.toMatch(/npg_[A-Za-z0-9]{10,}/);
    for (const line of example.split("\n")) {
      const match = /^(AI_API_KEY|SMTP_PASS|AUTH_SECRET|DATABASE_URL)="([^"]*)"/.exec(line);
      if (match && match[1] !== "DATABASE_URL") expect(match[2], `${match[1]} must be a placeholder`).toBe("");
    }
  });
});
