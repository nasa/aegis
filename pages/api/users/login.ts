import type { NextApiRequest, NextApiResponse } from "next";
import { bcrypt } from "bcryptjs";
import { withIronSessionApiRoute } from "iron-session/next";

import { ironOptions } from "server/session/config";
import { User } from "server/db/Users/models/user";

export default withIronSessionApiRoute(handler, ironOptions);

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    // if (req.method !== "POST") {
    //   res.status(405).send({ message: "Only POST requests allowed" });
    //   return;
    // }

    const loginResult = await login(req.query.username as string, req.query.password as string);
    if (loginResult.status === "success") {
      req.session.user = loginResult.user;
      await req.session.save();
    } else {
      req.session.destroy();
    }
    res.status(200).json(loginResult);
  } catch (error) {
    res.status(500).json({ status: "error", message: "Unexpected error :" + error });
  }
}

async function login(username: string, password: string) {
  const user = await User.findOne({
    where: {
      username: username,
    },
    attributes: ["id", "username", "email", "password", "permission"],
  });

  const passwordGood = await bcrypt.compare(password, user.password);
  if (passwordGood) {
    return {
      status: "success",
      user: {
        username: user.username,
        id: user.id,
        permission: user.permission,
      },
    };
  } else {
    return { status: "failure", message: "Login failed." };
  }
}
