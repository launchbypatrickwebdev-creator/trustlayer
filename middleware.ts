import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function middleware(request: Request) {
  const response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.headers.get("cookie")
            ? request.headers
                .get("cookie")!
                .split("; ")
                .map((cookie) => {
                  const [name, ...value] = cookie.split("=");
                  return {
                    name,
                    value: value.join("="),
                  };
                })
            : [];
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/deals/:path*",
    "/crypto/:path*",
    "/admin/:path*",
    "/profile/:path*",
    "/activity/:path*",
    "/support/:path*",
  ],
};