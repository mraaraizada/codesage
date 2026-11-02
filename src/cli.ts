#!/usr/bin/env node
// CodeSage CLI — a secondary interface over the same pipeline the web UI uses (src/pipeline.ts).
import { Command } from "commander";
import chalk from "chalk";
import ora, { type Ora } from "ora";
import { resolveRepoSource } from "./repo/resolveSource.js";
import { buildRepoIndex } from "./repo/indexer.js";
import { runPipeline, type PipelineStage } from "./pipeline.js";

const program = new Command();

program
  .name("codesage")
  .description("CodeSage — Intelligent code understanding and debugging. Understand. Investigate. Fix. Verify.")
  .version("0.1.0");

program
  .command("index")
  .description("Inspect a repository and print a real structural summary (no LLM calls).")
  .requiredOption("--repo <path>", "Local path or git URL of the repository to inspect")
  .action((options) => {
    const source = resolveRepoSource(options.repo);
    try {
      const index = buildRepoIndex(source.path);
      console.log(chalk.bold.cyan(`\nCodeSage repo index: ${source.path}`));
      console.log(`Files indexed: ${chalk.green(index.totalFiles)}  Total size: ${(index.totalSizeBytes / 1024).toFixed(1)} KB`);
      console.log(`Stack: ${chalk.yellow(index.stack.kinds.join(", "))}  Package manager: ${index.stack.packageManager ?? "n/a"}`);
      if (index.stack.testCommand) {
        console.log(`Detected test command: ${chalk.magenta(index.stack.testCommand.command + " " + index.stack.testCommand.args.join(" "))} (${index.stack.testCommand.source})`);
      } else {
        console.log(chalk.red("No test command detected."));
      }
      const sourceFiles = index.files.filter((f) => f.isSource);
      console.log(`\nSource files with extracted symbols: ${sourceFiles.length}`);
      for (const f of sourceFiles.slice(0, 25)) {
        console.log(chalk.bold(`  ${f.relPath}`) + chalk.dim(`  (${f.lineCount ?? "?"} lines)`));
        for (const s of f.symbols.slice(0, 8)) {
          console.log(chalk.dim(`    L${s.line}  [${s.kind}] ${s.name}${s.exported ? "  (exported)" : ""}`));
        }
      }
      if (sourceFiles.length > 25) console.log(chalk.dim(`  ...and ${sourceFiles.length - 25} more file(s)`));
    } finally {
      source.cleanup();
    }
  });

program
  .command("investigate")
  .description("Investigate a bug report end-to-end: search -> root cause -> patch -> test -> report.")
  .requiredOption("--repo <path>", "Local path or git URL of the repository to investigate")
  .requiredOption("--bug <description>", "Natural-language description of the bug")
  .option("--out <dir>", "Directory to write report.md / report.json into")
  .option("--dry-run", "Only run indexing + keyword search (no LLM calls)", false)
  .option("--keep-workspace", "Do not delete the isolated temp workspace after running", false)
  .option("--max-iterations <n>", "Max agentic tool-call iterations during investigation", (v) => parseInt(v, 10))
  .action(async (options) => {
    const source = resolveRepoSource(options.repo);
    let spinner: Ora | null = ora({ text: "Starting...", color: "cyan" }).start();
    const stageLabel: Record<PipelineStage, string> = {
      indexing: "Understanding codebase",
      searching: "Searching for evidence",
      investigating: "Investigating root cause (Claude)",
      "creating-workspace": "Creating isolated workspace",
      "testing-before": "Running tests (before patch)",
      patching: "Proposing patch (Claude)",
      "applying-patch": "Applying patch",
      "testing-after": "Running tests (after patch)",
      reporting: "Writing report",
      done: "Done",
      error: "Error",
    };

    try {
      const report = await runPipeline({
        repoPath: source.path,
        bugReport: options.bug,
        outDir: options.out,
        dryRun: Boolean(options.dryRun),
        keepWorkspace: Boolean(options.keepWorkspace),
        maxIterations: options.maxIterations,
        onEvent: (e) => {
          if (spinner) spinner.text = `${stageLabel[e.stage] ?? e.stage}: ${e.message}`;
        },
      });
      spinner?.succeed(chalk.bold("Pipeline complete."));
      spinner = null;

      console.log("");
      console.log(chalk.bold.underline("Verification status:"), colorForStatus(report.verification));
      console.log(report.verificationReason);
      if (report.investigation) {
        console.log("");
        console.log(chalk.bold("Root cause:"), report.investigation.rootCause);
        for (const e of report.investigation.evidence) {
          console.log(chalk.dim(`  evidence: ${e.relPath}:${e.line} — ${e.snippet}`));
        }
      }
      if (report.testsBefore || report.testsAfter) {
        console.log("");
        console.log(chalk.bold("Tests before:"), report.testsBefore ? `exit ${report.testsBefore.exitCode}, ${report.testsBefore.passed ?? "?"} passed / ${report.testsBefore.failed ?? "?"} failed` : "not run");
        console.log(chalk.bold("Tests after: "), report.testsAfter ? `exit ${report.testsAfter.exitCode}, ${report.testsAfter.passed ?? "?"} passed / ${report.testsAfter.failed ?? "?"} failed` : "not run");
      }
      console.log("");
      console.log(chalk.dim(`Full report written under: ${options.out ?? "(auto-generated codesage-report-* directory in the current folder)"}`));
    } catch (err) {
      spinner?.fail(chalk.red("Pipeline failed."));
      console.error(chalk.red((err as Error).message));
      process.exitCode = 1;
    } finally {
      source.cleanup();
    }
  });

function colorForStatus(status: string): string {
  if (status === "verified-fixed") return chalk.bgGreen.black(" VERIFIED FIXED ");
  if (status === "tests-still-failing") return chalk.bgRed.white(" TESTS STILL FAILING ");
  if (status === "patch-did-not-apply") return chalk.bgRed.white(" PATCH DID NOT APPLY ");
  if (status === "no-tests-detected") return chalk.bgYellow.black(" NO TESTS DETECTED ");
  if (status === "dry-run-no-llm") return chalk.bgBlue.white(" DRY RUN ");
  return chalk.bgYellow.black(" INCONCLUSIVE ");
}

program.parseAsync(process.argv);
