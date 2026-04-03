import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Public routes
  if (pathname === "/login" || pathname.startsWith("/api/auth")) {
    if (session) {
      const role = session.user?.role;
      const dest = role === "ADMIN" ? "/admin/dashboard" : "/responder/dashboard";
      return NextResponse.redirect(new URL(dest, req.url));
    }
    return NextResponse.next();
  }

  // Root redirect
  if (pathname === "/") {
    if (session) {
      const role = session.user?.role;
      const dest = role === "ADMIN" ? "/admin/dashboard" : "/responder/dashboard";
      return NextResponse.redirect(new URL(dest, req.url));
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Protected routes
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const role = session.user?.role;

  if (pathname.startsWith("/admin/dashboard") && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/responder/dashboard", req.url));
  }

  if (pathname.startsWith("/responder") && role !== "RESPONDER") {
    return NextResponse.redirect(new URL("/admin/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
