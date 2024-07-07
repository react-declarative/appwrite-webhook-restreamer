#!/usr/bin/env node

import { serializeError } from "serialize-error";

import http from "http";
import fs from "fs";

import bodyParser from "body-parser";

import EventEmitter from "events";

import express from "express";
import sockjs from "sockjs";

const [port = "9999"] = process.argv.slice(2);

const hasDisallowWsFlag = process.argv.includes("--disallowWs");

const app = express();

app.use((req, res, next) => {
  if (req.url === "/listen") {
    return;
  }
  next();
});

app.use(bodyParser.json());

app.options("*", (req, res) => {
  res.setHeader(
    `Access-Control-Allow-Origin`,
    req.headers.origin || req.hostname || "*",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] || "*",
  );
  res.setHeader(`Access-Control-Allow-Methods`, `GET,POST,PUT,PATCH,DELETE`);
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.sendStatus(200);
});

process.on("uncaughtException", (error) => {
  console.error(error);
  fs.writeFileSync("./error.txt", JSON.stringify(serializeError(error), null, 2));
  process.exit(-1);
});

process.on("unhandledRejection", (error) => {
  throw error;
});

const sockjsServer = sockjs.createServer();

const emitter = new EventEmitter();

{
  const clients = [];
  sockjsServer.on('connection', (conn) => {
    clients.push(conn);
    conn.on('close', () => {
      const index = clients.indexOf(conn);
      if (index !== -1) {
        clients.splice(index, 1);
      }
    });
  });
  emitter.on('event', (data) => {
    clients.forEach((client) => {
      client.write(JSON.stringify(data));
    });
  });
}

app.post("/emit", (req, res) => {
    const userId = req.header("x-appwrite-webhook-user-id");
    const projectId = req.header("x-appwrite-webhook-project-id");
    const events = req.header("x-appwrite-webhook-events");
    const timestamp = Date.now();
    const payload = req.body;
    emitter.emit("event", {
      userId,
      projectId,
      events,
      timestamp,
      payload,
    });
    res.status(200).send("ok");
});

const server = http
    .createServer(app)
    .listen(port, "0.0.0.0")
    .addListener("listening", () => {
      console.log(`Restream started: PORT=${port}`);
    });

sockjsServer.installHandlers(server, { prefix: '/listen', websocket: !hasDisallowWsFlag });
