import { describe, expect, it } from "vitest";
import { parseGithubLocator } from "./githubLocator.js";

describe("parseGithubLocator", () => {
  it("parses a repository locator", () => {
    expect(parseGithubLocator("github:owner/repo")).toMatchObject({
      owner: "owner",
      repo: "repo",
      id: "github:owner/repo",
      locator: "github:owner/repo",
    });
  });

  it("parses path and ref", () => {
    expect(
      parseGithubLocator("github:owner/repo/skills/pptx@main"),
    ).toMatchObject({
      owner: "owner",
      repo: "repo",
      path: "skills/pptx",
      ref: "main",
      id: "github:owner/repo/skills/pptx",
      locator: "github:owner/repo/skills/pptx@main",
    });
  });

  it("rejects non-github locators", () => {
    expect(() => parseGithubLocator("local:skills/ppt")).toThrow("github:");
  });
});
