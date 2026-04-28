#!/usr/bin/env node
/**
 * workspace-hub-docker
 * A tiny launcher that pulls and runs the workspace-hub MCP server Docker image.
 *
 * Usage:
 *   workspace-hub-docker up       – pull image and start (or restart) the container
 *   workspace-hub-docker down     – stop and remove the container
 *   workspace-hub-docker logs     – tail container logs
 *   workspace-hub-docker status   – show container status
 */

import { execFileSync, spawnSync } from "node:child_process";

const IMAGE = "ghcr.io/fluxpuck/workspace-hub:latest";
const CONTAINER = "workspace-hub";
const VOLUME = "workspace-hub-data";
const DEFAULT_PORT = "4440";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: "inherit", ...opts });
}

function capture(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function checkDocker() {
  const version = capture("docker", ["version", "--format", "{{.Server.Version}}"]);
  if (!version) {
    console.error(
      "Error: Docker is not installed or the daemon is not running.\n" +
        "Install Docker: https://docs.docker.com/get-docker/"
    );
    process.exit(1);
  }
}

function containerExists() {
  const id = capture("docker", ["ps", "-aq", "--filter", `name=^${CONTAINER}$`]);
  return id !== null && id !== "";
}

function containerRunning() {
  const state = capture("docker", [
    "inspect",
    "--format",
    "{{.State.Running}}",
    CONTAINER,
  ]);
  return state === "true";
}

// ─── Commands ────────────────────────────────────────────────────────────────

function cmdUp() {
  const port = process.env.PORT || DEFAULT_PORT;
  const hostPort = process.env.HOST_PORT || port;

  checkDocker();

  console.log(`Pulling ${IMAGE} …`);
  const pull = run("docker", ["pull", IMAGE]);
  if (pull.status !== 0) {
    console.error("Failed to pull image.");
    process.exit(pull.status ?? 1);
  }

  if (containerRunning()) {
    console.log(`Container "${CONTAINER}" is already running.`);
    console.log(`MCP server: http://localhost:${hostPort}/mcp`);
    return;
  }

  if (containerExists()) {
    console.log(`Starting existing container "${CONTAINER}" …`);
    const start = run("docker", ["start", CONTAINER]);
    if (start.status !== 0) process.exit(start.status ?? 1);
  } else {
    console.log(`Creating and starting container "${CONTAINER}" …`);
    const create = run("docker", [
      "run",
      "--detach",
      "--name", CONTAINER,
      "--restart", "unless-stopped",
      "-p", `${hostPort}:${port}`,
      "-v", `${VOLUME}:/app/data`,
      "-e", `PORT=${port}`,
      IMAGE,
    ]);
    if (create.status !== 0) process.exit(create.status ?? 1);
  }

  console.log(`\nWorkspace Hub is running.`);
  console.log(`MCP server: http://localhost:${hostPort}/mcp`);
}

function cmdDown() {
  checkDocker();

  if (!containerExists()) {
    console.log(`No container named "${CONTAINER}" found.`);
    return;
  }

  console.log(`Stopping "${CONTAINER}" …`);
  run("docker", ["stop", CONTAINER]);
  console.log(`Removing "${CONTAINER}" …`);
  run("docker", ["rm", CONTAINER]);
  console.log("Done.");
}

function cmdLogs() {
  checkDocker();

  if (!containerExists()) {
    console.error(`No container named "${CONTAINER}" found. Run "workspace-hub-docker up" first.`);
    process.exit(1);
  }

  run("docker", ["logs", "--follow", CONTAINER]);
}

function cmdStatus() {
  checkDocker();

  if (!containerExists()) {
    console.log(`Status: not created (run "workspace-hub-docker up" to start)`);
    return;
  }

  const status = capture("docker", [
    "inspect",
    "--format",
    "{{.State.Status}}",
    CONTAINER,
  ]);
  const image = capture("docker", [
    "inspect",
    "--format",
    "{{.Config.Image}}",
    CONTAINER,
  ]);
  console.log(`Container : ${CONTAINER}`);
  console.log(`Image     : ${image}`);
  console.log(`Status    : ${status}`);

  if (status === "running") {
    const port = process.env.HOST_PORT || process.env.PORT || DEFAULT_PORT;
    console.log(`MCP URL   : http://localhost:${port}/mcp`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

const [, , command] = process.argv;

switch (command) {
  case "up":
    cmdUp();
    break;
  case "down":
    cmdDown();
    break;
  case "logs":
    cmdLogs();
    break;
  case "status":
    cmdStatus();
    break;
  default:
    console.log(
      "workspace-hub-docker — Docker launcher for the Workspace Hub MCP server\n\n" +
        "Usage:\n" +
        "  workspace-hub-docker up       Pull image and start the container\n" +
        "  workspace-hub-docker down     Stop and remove the container\n" +
        "  workspace-hub-docker logs     Tail container logs\n" +
        "  workspace-hub-docker status   Show container status\n\n" +
        "Environment variables:\n" +
        "  PORT        Port the server listens on inside the container (default: 4440)\n" +
        "  HOST_PORT   Host port to expose (default: same as PORT)\n"
    );
    if (command !== undefined) process.exit(1);
}
