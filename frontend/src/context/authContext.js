import { createContext } from 'react';

/**
 * The context object lives apart from the provider component so that both
 * `AuthContext.jsx` and `useAuth.js` export exactly one kind of thing, which is
 * what keeps Vite's fast refresh working across edits to either.
 */
export const AuthContext = createContext(null);
