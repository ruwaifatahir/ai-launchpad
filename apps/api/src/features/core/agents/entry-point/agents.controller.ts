import type { Request, Response } from "express";
import { sendOk, zParse } from "@/shared";
import {
  agentParamsSchema,
  reviseAgentSchema,
  setAgentPauseSchema,
} from "@/features/core/agents/domain/schema";
import { reviseAgent } from "@/features/core/agents/domain/revision";
import { setAgentPause } from "@/features/core/agents/domain/pausing";
import { stopAgent } from "@/features/core/agents/domain/stopping";
import { readAgent } from "@/features/core/agents/domain/inspection";

export const patchAgent = async (req: Request, res: Response) => {
  const { params, body } = await zParse(reviseAgentSchema, req);
  const data = await reviseAgent(params, body);
  sendOk(res, data);
};

export const putAgentPause = async (req: Request, res: Response) => {
  const { params, body } = await zParse(setAgentPauseSchema, req);
  const data = await setAgentPause(params, body);
  sendOk(res, data);
};

export const putAgentStop = async (req: Request, res: Response) => {
  const { params } = await zParse(agentParamsSchema, req);
  const data = await stopAgent(params);
  sendOk(res, data);
};

export const getAgent = async (req: Request, res: Response) => {
  const { params } = await zParse(agentParamsSchema, req);
  const data = await readAgent(params);
  sendOk(res, data);
};
