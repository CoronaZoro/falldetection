import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    isAuthorized?: boolean;
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role?: string;
      isAuthorized?: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    isAuthorized?: boolean;
  }
}
