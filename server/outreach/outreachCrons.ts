import { Request, Response } from 'express';
import { sdk } from "../_core/sdk";
import { runLeadDiscovery } from "./leadDiscovery";
import { runOutreachSequence } from "./outreachSequence";
import { runLinkedInQueue } from "./linkedinQueue";

export async function outreachDiscoverHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await runLeadDiscovery();
    return res.json({ ...result, timestamp: new Date() });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export async function outreachSequenceHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await runOutreachSequence();
    return res.json({ ...result, timestamp: new Date() });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export async function outreachLinkedInHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await runLinkedInQueue();
    return res.json({ ...result, timestamp: new Date() });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
