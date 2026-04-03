import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import agentsRouter from "./agents";
import runsRouter from "./runs";
import streamRouter from "./stream";
import mcpConnectionsRouter from "./mcpConnections";
import webhooksRouter from "./webhooks";
import schedulesRouter from "./schedules";
import analyticsRouter from "./analytics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(agentsRouter);
router.use(runsRouter);
router.use(streamRouter);
router.use(mcpConnectionsRouter);
router.use(webhooksRouter);
router.use(schedulesRouter);
router.use(analyticsRouter);

export default router;
