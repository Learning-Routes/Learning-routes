import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";

/** A page as the app renders it, inside the router: its theme switch reads the address. */
export const inRouter = (element: ReactElement, path = "/") => (
  <RouterProvider
    router={createMemoryRouter([{ path: "*", element }], { initialEntries: [path] })}
  />
);
