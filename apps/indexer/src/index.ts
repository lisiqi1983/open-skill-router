#!/usr/bin/env node
import { Command } from "commander";
import { buildStaticIndexFromManifest } from "./builder.js";

export { buildStaticIndexFromManifest } from "./builder.js";

const program = new Command();

program
  .name("open-skill-router-indexer")
  .description("Build static Open Skill Router JSONL indexes.")
  .version("0.0.0");

program
  .command("build")
  .description("Build a static index from a skillrouter.source.yaml manifest.")
  .argument("<manifest>", "Path to skillrouter.source.yaml.")
  .requiredOption("-o, --out <dir>", "Output directory for static files.")
  .option("--json", "Print machine-readable JSON.")
  .action(
    async (
      manifest: string,
      options: {
        out: string;
        json?: boolean;
      },
    ) => {
      const result = await buildStaticIndexFromManifest(manifest, {
        outDir: options.out,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`Built static index: ${result.manifest.name}`);
      console.log(`Skills: ${result.manifest.skillCount}`);
      console.log(`Manifest: ${result.manifestPath}`);
      console.log(`JSONL: ${result.skillsPath}`);
      console.log(`Checksum: ${result.checksumPath}`);
    },
  );

if (isDirectRun()) {
  program.parseAsync(process.argv).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`open-skill-router-indexer: ${message}`);
    process.exitCode = 1;
  });
}

function isDirectRun(): boolean {
  const invokedPath = process.argv[1]?.replace(/\\/g, "/");
  return Boolean(invokedPath && import.meta.url.endsWith(invokedPath));
}
