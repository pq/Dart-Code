import * as child_process from "child_process";
import { LogCategory } from "../../shared/enums";
import { Logger, SpawnedProcess } from "../../shared/interfaces";
import { logProcess } from "../../shared/logging";
import { nullToUndefined } from "./misc";

// Environment used when spawning Dart and Flutter processes.
export let toolEnv: { [key: string]: string } = {};
export let globalFlutterArgs: string[] = [];

export function setupToolEnv(envOverrides?: object) {
	toolEnv = Object.create(process.env);
	globalFlutterArgs = [];

	toolEnv.FLUTTER_HOST = "VSCode";
	toolEnv.PUB_ENVIRONMENT = (toolEnv.PUB_ENVIRONMENT ? `${toolEnv.PUB_ENVIRONMENT}:` : "") + "vscode.dart-code";
	if (process.env.DART_CODE_IS_TEST_RUN) {
		toolEnv.PUB_ENVIRONMENT += ".test.bot";
		globalFlutterArgs.push("--suppress-analytics");
	}

	// Add on any overrides.
	if (envOverrides)
		toolEnv = Object.assign(Object.create(toolEnv), envOverrides);
}
// TODO: Should we move this to extension activate?
setupToolEnv();

export function safeSpawn(workingDirectory: string | undefined, binPath: string, args: string[], envOverrides?: any): SpawnedProcess {
	// Spawning processes on Windows with funny symbols in the path requires quoting. However if you quote an
	// executable with a space in its path and an argument also has a space, you have to then quote all of the
	// arguments too!\
	// https://github.com/nodejs/node/issues/7367
	const customEnv = envOverrides
		? Object.assign(Object.create(toolEnv), envOverrides) // Do it this way so we can override toolEnv if required.
		: toolEnv;
	const quotedArgs = args.map((a) => `"${a.replace(/"/g, `\\"`)}"`);
	return child_process.spawn(`"${binPath}"`, quotedArgs, { cwd: workingDirectory, env: customEnv, shell: true }) as SpawnedProcess;
}

/// Runs a process and returns the exit code, stdout, stderr. Always resolves even for non-zero exit codes.
export function runProcess(logger: Logger, workingDirectory: string | undefined, binPath: string, args: string[], envOverrides?: any): Promise<RunProcessResult> {
	return new Promise((resolve) => {
		logger.info(`Spawning ${binPath} with args ${JSON.stringify(args)} in ${workingDirectory} with env ${JSON.stringify(envOverrides)}`);
		const proc = safeSpawn(workingDirectory, binPath, args, envOverrides);
		logProcess(logger, LogCategory.CommandProcesses, proc);

		const out: string[] = [];
		const err: string[] = [];
		proc.stdout.on("data", (data: Buffer) => out.push(data.toString()));
		proc.stderr.on("data", (data: Buffer) => err.push(data.toString()));
		proc.on("exit", (code) => {
			resolve(new RunProcessResult(nullToUndefined(code), out.join(""), err.join("")));
		});
	});
}

export class RunProcessResult {
	constructor(public readonly exitCode: number | undefined, public readonly stdout: string, public readonly stderr: string) { }
}
