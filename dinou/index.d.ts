// dinou/index.d.ts
import { IncomingHttpHeaders } from "http";

// ====================================================================
// REQUEST PROPERTIES TYPES (REQ)
// ====================================================================

/**
 * Represents the query object (URL parameters) passed to the SSR process.
 */
export type Query = Record<string, string | string[] | undefined>;

/**
 * Represents the serialized cookies object.
 */
export type Cookies = Record<string, string>;

/**
 * Represents the serialized headers object.
 */
export type Headers = IncomingHttpHeaders;

// ====================================================================
// RESPONSE PROXY INTERFACE (RES)
// ====================================================================

export type CookieOptions = {
  domain?: string;
  encode?: (val: string) => string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  priority?: "low" | "medium" | "high";
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
  signed?: boolean;
};

/**
 * Interface that simulates Express response functions (res),
 * but which send IPC commands to the main process during SSR.
 */
export interface ResponseProxy {
  /**
   * Sends a command to set a cookie.
   * @param name The name of the cookie.
   * @param value The value of the cookie.
   * @param options Configuration options for the cookie.
   */
  cookie(name: string, value: string, options?: CookieOptions): void;

  /**
   * Sends a command to the main process to clear a cookie.
   * @param name Name of the cookie to clear.
   * @param options Cookie options (e.g., domain, path).
   */
  clearCookie(name: string, options?: { domain?: string; path?: string }): void;

  /**
   * Sends a command to the main process to set an HTTP header.
   * @param name Header name (e.g., 'Content-Type').
   * @param value Header value.
   */
  setHeader(name: string, value: string | ReadonlyArray<string>): void;

  /**
   * Sends commands to the main process to set the status and redirect.
   */
  redirect(status: number, url: string): void;
  redirect(url: string): void;
  status(code: number): void;
}

// ====================================================================
// MAIN CONTEXT STORE INTERFACE
// ====================================================================

/**
 * The complete context object stored in AsyncLocalStorage.
 */
export interface RequestContextStore {
  /**
   * Serialized request data transferred from the main process.
   */
  req: {
    query: Query;
    cookies: Cookies;
    headers: Headers;
    path: string;
    method: "GET" | "POST" | string;
  };

  /**
   * The response proxy that allows SSR components to execute
   * response functions in the main process.
   */
  res: ResponseProxy;
}

// ====================================================================
// MAIN EXPORTED FUNCTIONS (SERVER SIDE)
// ====================================================================

/**
 * Gets the current request context (req and res proxy) synchronously.
 * It must be called within a Server Function or an SSR component
 * wrapped inside requestStorage.run().
 * * NOTE: If no context is active, this function returns undefined.
 * The consumer must handle the guard clause (e.g., if (!context) return;).
 * @returns {RequestContextStore | undefined} The current context object or undefined if called out of scope.
 */
export declare function getContext(): RequestContextStore | undefined;

// ====================================================================
// CLIENT NAVIGATION HOOKS (CLIENT SIDE)
// ====================================================================

/**
 * A Client Component hook that lets you read the current URL's pathname.
 * This hook triggers a re-render when the route changes.
 *
 * @returns {string} The current pathname (e.g., "/dashboard") without query parameters.
 * @example
 * const pathname = usePathname();
 * if (pathname === '/active') { ... }
 */
export declare function usePathname(): string;

/**
 * A Client Component hook that lets you read the current URL's search parameters.
 * This hook triggers a re-render when the route changes.
 *
 * @returns {URLSearchParams} A read-only version of the standard URLSearchParams interface.
 * @example
 * const searchParams = useSearchParams();
 * const page = searchParams.get('page');
 */
export declare function useSearchParams(): URLSearchParams;

/**
 * A Client Component hook that allows you to programmatically navigate between routes.
 *
 * @returns {object} An object containing navigation methods.
 * @example
 * const router = useRouter();
 * router.push('/dashboard');
 */
export declare function useRouter(): {
  /**
   * Navigate to the provided href. Pushes a new entry into the history stack.
   * @param href - The URL to navigate to (e.g., "/about").
   */
  push: (href: string) => void;

  /**
   * Navigate to the provided href. Replaces the current entry in the history stack.
   * @param href - The URL to navigate to.
   */
  replace: (href: string) => void;
};

/**
 * A Client Component hook that returns true if a navigation (SPA transition) is currently in progress.
 * Useful for showing progress bars or loading spinners globally.
 *
 * @returns {boolean} True if navigation is pending, false otherwise.
 */
export declare function useNavigationLoading(): boolean;
