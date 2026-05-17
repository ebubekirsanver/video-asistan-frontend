import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'jwt_token';
const USER_KEY = 'user_data';
const REGISTERED_USERS_KEY = 'edua_registered_users_v2';

// --- Token Management (SecureStore) ---

export const saveToken = async (token: string): Promise<void> => {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
};

export const getToken = async (): Promise<string | null> => {
  return SecureStore.getItemAsync(TOKEN_KEY);
};

export const removeToken = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
};

// --- User Data ---

export interface UserData {
  email: string;
  name: string;
}

interface StoredUser {
  email: string;
  name: string;
  password: string;
}

export const saveUserData = async (user: UserData): Promise<void> => {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
};

export const getUserData = async (): Promise<UserData | null> => {
  const data = await SecureStore.getItemAsync(USER_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data) as UserData;
  } catch {
    return null;
  }
};

export const removeUserData = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(USER_KEY);
};

export const clearAuth = async (): Promise<void> => {
  await removeToken();
  await removeUserData();
};

// --- Local Auth (mimics the web localStorage auth) ---
// The backend has NO /api/auth/* endpoints.
// The original web app uses localStorage for auth.
// We replicate that here using AsyncStorage.

function generateLocalToken(email: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `local_${timestamp}_${random}_${btoa(email).replace(/=/g, '')}`;
}

async function getRegisteredUsers(): Promise<StoredUser[]> {
  try {
    const data = await AsyncStorage.getItem(REGISTERED_USERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

async function saveRegisteredUsers(users: StoredUser[]): Promise<void> {
  await AsyncStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(users));
}

/**
 * Register a new user locally.
 * Returns the user data on success.
 * Throws an error if validation fails or email already exists.
 */
export async function localRegister(
  email: string,
  password: string,
  name: string
): Promise<{ token: string; user: UserData }> {
  // Validation
  if (!name.trim()) {
    throw new Error('Ad soyad gerekli.');
  }
  if (!email.trim() || !email.includes('@')) {
    throw new Error('Geçerli bir e-posta adresi girin.');
  }
  if (!password || password.length < 6) {
    throw new Error('Şifre en az 6 karakter olmalı.');
  }

  const users = await getRegisteredUsers();
  const normalizedEmail = email.trim().toLowerCase();

  // Check if email already exists
  const existing = users.find((u) => u.email === normalizedEmail);
  if (existing) {
    throw new Error('Bu e-posta adresi zaten kayıtlı.');
  }

  // Create new user
  const newUser: StoredUser = {
    email: normalizedEmail,
    name: name.trim(),
    password, // In production, hash this. For local-only it's acceptable.
  };

  users.push(newUser);
  await saveRegisteredUsers(users);

  // Auto-login after registration
  const token = generateLocalToken(normalizedEmail);
  const userData: UserData = { email: normalizedEmail, name: name.trim() };

  await saveToken(token);
  await saveUserData(userData);

  return { token, user: userData };
}

/**
 * Login with email and password locally.
 * Returns token + user data on success.
 * Throws an error if credentials are wrong.
 */
export async function localLogin(
  email: string,
  password: string
): Promise<{ token: string; user: UserData }> {
  if (!email.trim() || !password) {
    throw new Error('E-posta ve şifre gerekli.');
  }

  const users = await getRegisteredUsers();
  const normalizedEmail = email.trim().toLowerCase();

  const user = users.find(
    (u) => u.email === normalizedEmail && u.password === password
  );

  if (!user) {
    throw new Error('Hatalı e-posta veya şifre.');
  }

  const token = generateLocalToken(normalizedEmail);
  const userData: UserData = { email: user.email, name: user.name };

  await saveToken(token);
  await saveUserData(userData);

  return { token, user: userData };
}
