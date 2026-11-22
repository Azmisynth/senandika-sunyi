import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { API_URL, login, onInvalidSession } from './ApiService';

const CACHE_KEY = 'senandika-sunyi.session';
const SESSION_LENGTH = 60 * 60 * 1000;
const SessionContext = createContext(null);

async function readSession() {
  try {
    const raw = Platform.OS === 'web'
      ? globalThis.sessionStorage?.getItem(CACHE_KEY)
      : await SecureStore.getItemAsync(CACHE_KEY);
    if (!raw) return null;

    const { api, session } = JSON.parse(raw);
    return api === API_URL
      && session?.role === 'visitor'
      && typeof session.username === 'string'
      && typeof session.token === 'string'
      && Number.isFinite(session.expiresAt)
      && session.expiresAt > Date.now()
      ? session
      : null;
  } catch {
    return null;
  }
}

async function writeSession(session) {
  if (Platform.OS === 'web') {
    if (session) {
      globalThis.sessionStorage?.setItem(CACHE_KEY, JSON.stringify({ api: API_URL, session }));
    } else {
      globalThis.sessionStorage?.removeItem(CACHE_KEY);
    }
    return;
  }

  if (session) {
    await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify({ api: API_URL, session }));
  } else {
    await SecureStore.deleteItemAsync(CACHE_KEY);
  }
}

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const currentSession = useRef(null);
  const pendingWrite = useRef(Promise.resolve());
  const actionVersion = useRef(0);

  const changeSession = useCallback((next) => {
    currentSession.current = next;
    setSession(next);
    pendingWrite.current = pendingWrite.current
      .then(() => writeSession(next))
      .catch(() => {}); // Storage can be unavailable in private browsing or on the device.
    return pendingWrite.current;
  }, []);

  const signOut = useCallback(() => {
    actionVersion.current += 1;
    return changeSession(null);
  }, [changeSession]);

  const signIn = useCallback(async (username, password) => {
    const requestVersion = ++actionVersion.current;
    const account = username.trim();
    const result = await login(account, password);
    if (requestVersion !== actionVersion.current) {
      throw new Error('The sign-in request was cancelled.');
    }
    if (result?.role !== 'visitor') {
      throw new Error('Please sign in with a visitor account.');
    }
    if (typeof result.access_token !== 'string' || !result.access_token) {
      throw new Error('The service did not return a valid session.');
    }

    const next = {
      username: account,
      token: result.access_token,
      role: result.role,
      expiresAt: Date.now() + SESSION_LENGTH,
    };
    await changeSession(next);
    if (requestVersion !== actionVersion.current) {
      throw new Error('The sign-in request was cancelled.');
    }
    return next;
  }, [changeSession]);

  useEffect(() => {
    let active = true;
    const restoreVersion = actionVersion.current;
    readSession().then((stored) => {
      if (!active) return;
      if (restoreVersion === actionVersion.current) changeSession(stored);
      setRestoring(false);
    });
    return () => { active = false; };
  }, [changeSession]);

  useEffect(() => onInvalidSession((token) => {
    if (currentSession.current?.token === token) {
      // A late response from the previous session must not interrupt a new sign-in.
      void changeSession(null);
    }
  }), [changeSession]);

  useEffect(() => {
    if (!session) return undefined;
    const expire = () => {
      if (currentSession.current === session) void changeSession(null);
    };
    const timer = setTimeout(expire, Math.max(0, session.expiresAt - Date.now()));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && session.expiresAt <= Date.now()) expire();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [session, changeSession]);

  return (
    <SessionContext.Provider value={{ session, signIn, signOut, restoring, ready: !restoring }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used within SessionProvider.');
  return session;
}
