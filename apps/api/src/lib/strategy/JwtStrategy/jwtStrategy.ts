import { Strategy, ExtractJwt } from "passport-jwt";
import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME, JWT_ACCESS_TOKEN_SECRET, JWT_REFRESH_TOKEN_SECRET } from "../../constants";
import { Request } from "express";
import { getPrisma } from "../../prisma";

const accessTokenOptions = {
  jwtFromRequest: (req: Request) => req.cookies[ACCESS_TOKEN_COOKIE_NAME] as string | null,
  secretOrKey: JWT_ACCESS_TOKEN_SECRET,
};

const refreshTokenOptions = {
  jwtFromRequest: (req: Request) => req.cookies[REFRESH_TOKEN_COOKIE_NAME] as string | null,
  secretOrKey: JWT_REFRESH_TOKEN_SECRET,
};

export const jwtVerify = async (payload: Express.User & { sub?: string }, done: (err: unknown, user?: Express.User | false) => void) => {
  try {
    const { sub, ...rest } = payload as Express.User & { sub?: string };
    const user: Express.User = { ...rest, id: sub ?? (payload as Express.User).id };
    done(null, user);
  } catch (err) {
    done(err, false);
  }
};

export const refreshJwtVerify = async (payload: Express.User & { jti?: string }, done: (err: unknown, user?: Express.User | false) => void) => {
  try {
    if (payload.jti) {
      const blacklisted = await getPrisma().refreshTokenBlacklist.findUnique({ where: { jti: payload.jti }, select: { jti: true } });
      if (blacklisted) return done(null, false);
    }
    const user = await getPrisma().user.findUnique({ where: { id: payload.id }, select: { isDeleted: true } });
    if (!user || user.isDeleted) return done(null, false);
    done(null, payload);
  } catch (err) {
    done(err, false);
  }
};

export const accessTokenStrategy = new Strategy(accessTokenOptions, jwtVerify);
export const refreshTokenStrategy = new Strategy(refreshTokenOptions, refreshJwtVerify);
