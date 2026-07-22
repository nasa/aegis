import type { Request, Response } from "express";
import type { EmssUser } from "@emss/oauth2-proxy-common";

export declare const getUserFromJWT: (req: Request) => EmssUser | Error;

export declare const handleUnableToDecodeJWT: (err: Error, res: Response) => void;
