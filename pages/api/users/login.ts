import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import bcrypt from "bcryptjs";

import { ironOptions } from "server/session/config";
import { User } from "server/database/models/user.model";
import type { IronSessionData } from "iron-session";

import Mikro from "utils/mikro";

export default withIronSessionApiRoute(Mikro.withORM(handler), ironOptions);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WrappedResponse<IronSessionData>>
) {
  try {
    if (req.method !== "POST") {
      res.status(405).send({ status: "error", message: "Only POST requests allowed" });
      return;
    }

    const loginResult = await login(req.body.username as string, req.body.password as string);
    if (loginResult.status === "success") {
      req.session.user = loginResult.data.user;
      await req.session.save();
    } else {
      req.session.destroy();
    }
    res.status(200).json(loginResult);
  } catch (error) {
    res.status(500).json({ status: "error", message: "Unexpected error :" + error });
  }
}

async function login(
  username: string,
  password: string
): Promise<WrappedResponse<IronSessionData>> {
  const model = Mikro.getEM();
  const user = await model.findOne(User, { username });
  if (!user) {
    return { status: "failure", message: "No such user." };
  } else {
    const passwordGood = await bcrypt.compare(password, user.password);
    if (passwordGood) {
      return {
        status: "success",
        message: "login successful",
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            permission: user.permission,
          },
        },
      };
    } else {
      return { status: "failure", message: "Incorrect password." };
    }
  }
}
