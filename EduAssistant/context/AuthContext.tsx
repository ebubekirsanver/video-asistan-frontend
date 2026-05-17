import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {
  getToken,
  getUserData,
  clearAuth,
  localLogin,
  localRegister,
  type UserData,
} from '../services/auth';

// --- Types ---

interface AuthState {
  isLoading: boolean;
  isSignedIn: boolean;
  user: UserData | null;
  token: string | null;
}

type AuthAction =
  | { type: 'RESTORE_TOKEN'; token: string | null; user: UserData | null }
  | { type: 'SIGN_IN'; token: string; user: UserData }
  | { type: 'SIGN_OUT' }
  | { type: 'SET_LOADING'; loading: boolean };

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    name: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

// --- Reducer ---

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'RESTORE_TOKEN':
      return {
        ...state,
        isLoading: false,
        isSignedIn: !!action.token,
        token: action.token,
        user: action.user,
      };
    case 'SIGN_IN':
      return {
        ...state,
        isLoading: false,
        isSignedIn: true,
        token: action.token,
        user: action.user,
      };
    case 'SIGN_OUT':
      return {
        ...state,
        isLoading: false,
        isSignedIn: false,
        token: null,
        user: null,
      };
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.loading,
      };
    default:
      return state;
  }
}

// --- Context ---

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    isLoading: true,
    isSignedIn: false,
    user: null,
    token: null,
  });

  // Bootstrap: check for existing token
  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        const [token, user] = await Promise.all([
          getToken(),
          getUserData(),
        ]);
        dispatch({ type: 'RESTORE_TOKEN', token, user });
      } catch {
        dispatch({ type: 'RESTORE_TOKEN', token: null, user: null });
      }
    };

    bootstrapAsync();
  }, []);

  /**
   * Sign in using local auth (no backend endpoint exists).
   * Credentials are stored on-device with AsyncStorage + SecureStore.
   */
  const signIn = useCallback(async (email: string, password: string) => {
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      const result = await localLogin(email, password);
      dispatch({ type: 'SIGN_IN', token: result.token, user: result.user });
    } catch (error: unknown) {
      dispatch({ type: 'SET_LOADING', loading: false });
      throw error; // Re-throw with the meaningful message from localLogin
    }
  }, []);

  /**
   * Sign up using local auth (no backend endpoint exists).
   * User data is stored on-device.
   */
  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      dispatch({ type: 'SET_LOADING', loading: true });
      try {
        const result = await localRegister(email, password, name);
        dispatch({ type: 'SIGN_IN', token: result.token, user: result.user });
      } catch (error: unknown) {
        dispatch({ type: 'SET_LOADING', loading: false });
        throw error; // Re-throw with the meaningful message from localRegister
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    await clearAuth();
    dispatch({ type: 'SIGN_OUT' });
  }, []);

  const contextValue: AuthContextType = {
    ...state,
    signIn,
    signUp,
    signOut,
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
