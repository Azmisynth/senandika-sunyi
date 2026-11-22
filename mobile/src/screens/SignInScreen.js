import React, { useRef, useState } from 'react';
import { View } from 'react-native';

import { useSession } from '../lib/Session';
import { Button, Field, Notice, VisitorScreen, visitorStyles } from './VisitorUI';

export default function SignInScreen({ navigation }) {
  const { signIn } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);

  function close() {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace('Dashboard');
  }

  async function submit() {
    if (submitting.current) return;
    const name = username.trim();
    if (name.length < 3 || !password) {
      setError('Enter your username and password.');
      return;
    }
    submitting.current = true;
    setError('');
    setBusy(true);
    try {
      await signIn(name, password);
      if (navigation.isFocused()) close();
    } catch (failure) {
      setError(failure.message || 'Sign-in failed. Please try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <VisitorScreen
      title="Sign in"
      subtitle="Save places and share what you notice on a visit."
      onBack={() => { if (!submitting.current) close(); }}
    >
      <View style={visitorStyles.form}>
        <Field
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          maxLength={64}
          editable={!busy}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          maxLength={128}
          editable={!busy}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Notice>{error}</Notice>
        <Button label={busy ? 'Signing in' : 'Sign in'} busy={busy} onPress={submit} />
      </View>
    </VisitorScreen>
  );
}
