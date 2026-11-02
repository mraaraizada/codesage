import { describe, it, expect } from "vitest";
import { splitBugReport, looksLikeGenuineBugSplit } from "../src/llm/splitBugReport.js";

const FIXORA_BUG_REPORT = `# FIXORA Test 03 — React Application Bug Report

## Project objective

Evaluate autonomous debugging across React components,
state management, authentication, hooks and routing.

## Bug 01 — Login navigation failure

Description:
Valid login credentials are accepted, but the application
does not navigate to the dashboard.

## Bug 02 — Logout state synchronization

Description:
After logout, the navbar may continue showing the
previous authenticated user's information.

## Bug 03 — Protected route vulnerability

Description:
Unauthenticated users can access protected pages.

## Bug 04 — Profile synchronization failure

Description:
After editing and saving a profile, the shared
application user information does not update.

## FIXORA investigation requirements

1. Inspect the entire repository.
2. Identify all four root causes independently.
3. Trace dependencies between components, hooks and context.

Do not fabricate test results.
`;

describe("splitBugReport — structural (headings)", () => {
  it("splits the real fixora-test-03-react BUG_REPORT.md into exactly its 4 bugs, by structural parsing only (no LLM call)", async () => {
    const result = await splitBugReport(FIXORA_BUG_REPORT);
    expect(result.method).toBe("structural");
    expect(result.subBugs).toHaveLength(4);
    expect(result.subBugs[0].title).toMatch(/Bug 01/);
    expect(result.subBugs[1].title).toMatch(/Bug 02/);
    expect(result.subBugs[2].title).toMatch(/Bug 03/);
    expect(result.subBugs[3].title).toMatch(/Bug 04/);
  });

  it("excludes the trailing shared 'investigation requirements' section from the last bug's body", async () => {
    const result = await splitBugReport(FIXORA_BUG_REPORT);
    const last = result.subBugs[3];
    expect(last.body).toContain("Profile synchronization failure");
    expect(last.body).not.toContain("Inspect the entire repository");
    expect(last.body).not.toContain("Do not fabricate test results");
  });

  it("keeps each sub-bug self-contained with its own description text, not just a title", async () => {
    const result = await splitBugReport(FIXORA_BUG_REPORT);
    expect(result.subBugs[1].body).toContain("previous authenticated user's information");
  });
});

describe("splitBugReport — structural (numbered list)", () => {
  it("splits a plain numbered list of substantial, independent bug descriptions", async () => {
    const report = [
      "1. The checkout page crashes with a TypeError whenever the cart contains more than 9 items, because the quantity stepper component indexes past the end of a fixed-size array.",
      "2. Password reset emails are never sent in production because the mailer service silently swallows SMTP connection errors instead of surfacing them to the caller.",
    ].join("\n\n");
    const result = await splitBugReport(report);
    expect(result.method).toBe("structural");
    expect(result.subBugs).toHaveLength(2);
    expect(result.subBugs[0].body).toContain("checkout page crashes");
    expect(result.subBugs[1].body).toContain("Password reset emails");
  });

  it("does NOT treat a short instructional checklist as multiple bugs", async () => {
    const report = [
      "The login button does nothing when clicked.",
      "",
      "Steps to reproduce:",
      "1. Open the login page.",
      "2. Click sign in.",
      "3. Nothing happens.",
    ].join("\n");
    const result = await splitBugReport(report);
    expect(result.method).toBe("single");
    expect(result.subBugs).toHaveLength(1);
  });
});

describe("splitBugReport — single-bug detection", () => {
  it("treats an ordinary prose bug report describing one bug as a single bug, with no orchestration overhead", async () => {
    const report =
      "After a user enters correct credentials and clicks 'Log in', the app shows they're logged in, but it never navigates to /dashboard. The auth state updates correctly, navigation just doesn't happen.";
    const result = await splitBugReport(report);
    expect(result.method).toBe("single");
    expect(result.subBugs).toHaveLength(1);
    expect(result.subBugs[0].body).toBe(report);
  });

  it("forceSingle always returns exactly one sub-bug, even for structurally multi-bug text", async () => {
    const result = await splitBugReport(FIXORA_BUG_REPORT, { forceSingle: true });
    expect(result.method).toBe("single");
    expect(result.subBugs).toHaveLength(1);
  });
});

describe("looksLikeGenuineBugSplit — rejects a hallucinated debugging procedure", () => {
  const ORIGINAL_REPORT =
    "Analyze this complete React application. The repository contains four deliberately introduced bugs involving: " +
    "1. Login authentication and dashboard navigation. 2. Logout and shared authentication state. " +
    "3. Protected route authorization. 4. Profile updates and React Context synchronization.";

  it("rejects a real observed failure: the model answered 'how to debug this' instead of splitting it", () => {
    // Verbatim shape of a real failure: a weaker model, asked to split a bug report into bugs,
    // instead produced a generic step-by-step debugging checklist — none of these items describe
    // an actual broken behavior, and none of them restate anything from the real report above.
    const hallucinatedProcedure = [
      { title: "Bug 1", body: "Set up a reproducible environment - Clone the repository locally and install dependencies (npm ci)." },
      { title: "Bug 2", body: "Run the existing test suite - Execute npm test and note the failing tests." },
      { title: "Bug 3", body: "Identify each bug - Look at the login component and authentication service." },
      { title: "Bug 4", body: "Create targeted fixes - For each bug, open the relevant files and adjust code." },
      { title: "Bug 5", body: "Generate unified Git patches - run git diff --unified=3 for each bug." },
      { title: "Bug 6", body: "Validate patches - Apply each patch in a clean clone with git apply." },
      { title: "Bug 7", body: "Run the full test suite after all fixes - all tests should pass." },
      { title: "Bug 8", body: "Manual verification steps - attempt to log in with a wrong password." },
    ];

    expect(looksLikeGenuineBugSplit(hallucinatedProcedure, ORIGINAL_REPORT)).toBe(false);
  });

  it("accepts a genuine split that restates real content from the original report", () => {
    const genuineSplit = [
      { title: "Bug 1", body: "Login authentication: valid credentials are accepted but the app never navigates to the dashboard." },
      { title: "Bug 2", body: "Logout and shared authentication state: after logout, the navbar still shows the previous user." },
      { title: "Bug 3", body: "Protected route authorization: unauthenticated users can still access protected pages." },
      { title: "Bug 4", body: "Profile updates and React Context synchronization: saved profile changes don't propagate to shared state." },
    ];

    expect(looksLikeGenuineBugSplit(genuineSplit, ORIGINAL_REPORT)).toBe(true);
  });
});

describe("splitBugReport — structural numbered-list false positive (real observed failure)", () => {
  it("does not mistake a report's own numbered INVESTIGATION PROCEDURE for a list of distinct bugs", async () => {
    // Real shape: a single-bug report (one calculator divide-by-zero bug) whose own "investigation
    // requirements" section is a numbered procedure list — splitByNumberedList's length>=40 guard
    // alone let this through before, misdetecting ~10-12 "bugs" from procedure steps and running a
    // pointless multi-bug batch against a repo with exactly one real bug.
    const report = `Analyze this repository as an autonomous AI software engineer.

Investigate the reported calculator division bug: divide() returns incorrect results and does not raise ValueError on division by zero.

Investigation requirements:

1. Inspect the complete repository and understand its structure before making any changes.
2. Identify the affected files and functions using real evidence, not guesses.
3. Find the actual root cause using source-code evidence read directly from the files.
4. Explain clearly why the incorrect behavior occurs in terms of the actual code.
5. Generate a minimal and correct code patch that fixes only the real root cause.
6. Show the before-and-after code differences as a real unified diff.
7. Apply the proposed patch only inside an isolated working copy, never the original repo.
8. Install or identify the required dependencies before running any tests.
9. Run the existing test suite before and after applying the fix to compare results.
10. Display the actual terminal output and real test results, not a summary.`;

    const result = await splitBugReport(report);
    expect(result.method).toBe("single");
    expect(result.subBugs).toHaveLength(1);
  });
});
