import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View, type TextInput } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Button, Field, Icon, Notice, Screen, Text } from '@/components/ui';
import { ApiError, completeTwoStep, login } from '@/lib/api';
import { WEB_BASE } from '@/lib/config';
import { currentLang, setLang } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { radius, useColors } from '@/lib/theme';

/** The server's refusal, in the reader's language where we know it. */
function explain(e: unknown, t: (k: string) => string): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return t('login.errors.wrong');
    if (e.status === 429) return t('login.errors.tooMany');
    if (e.status === 403 && /verify/i.test(e.message)) return t('login.errors.verify');
    return e.message;
  }
  return t('login.errors.network');
}

export default function Login() {
  const { t } = useTranslation();
  const c = useColors();
  const { refresh } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfa, setMfa] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  async function signIn() {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const challenge = await login(email, password);
      if (challenge) setMfa(challenge.mfaToken);
      else await refresh();
    } catch (e) {
      setError(explain(e, t));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!mfa || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await completeTwoStep(mfa, code);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? t('login.errors.code') : explain(e, t));
    } finally {
      setBusy(false);
    }
  }

  const lang = currentLang();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen edges={['top', 'bottom']} contentStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 20 }}>
        <View style={{ alignItems: 'flex-end' }}>
          <Pressable accessibilityRole="button" onPress={() => void setLang(lang === 'ar' ? 'en' : 'ar')} style={{ padding: 8 }}>
            <Text size="sm" tone="accent" weight="medium">
              {lang === 'ar' ? 'English' : 'العربية'}
            </Text>
          </Pressable>
        </View>

        <View style={{ gap: 12 }}>
          <View style={{ width: 52, height: 52, borderRadius: radius.lg, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text size="xl" tone="onAccent" weight="bold">
              V
            </Text>
          </View>
          <Text size="xxl" weight="bold">
            {mfa ? t('login.twoStepTitle') : t('login.title')}
          </Text>
          <Text tone="muted">{mfa ? t('login.twoStepBody') : t('login.subtitle')}</Text>
        </View>

        {error ? <Notice tone="danger">{error}</Notice> : null}

        {mfa ? (
          <View style={{ gap: 14 }}>
            <Field
              label={t('login.code')}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              autoFocus
              hint={t('login.codeHint')}
              onSubmitEditing={confirm}
              testID="login-code"
            />
            <Button label={t('login.confirm')} onPress={confirm} busy={busy} testID="login-confirm" />
            <Button
              label={t('login.back')}
              kind="ghost"
              onPress={() => {
                setMfa(null);
                setCode('');
                setError(null);
              }}
            />
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            <Field
              label={t('login.email')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              testID="login-email"
            />
            <Field
              ref={passwordRef}
              label={t('login.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={signIn}
              testID="login-password"
            />
            <Button label={t('login.submit')} onPress={signIn} busy={busy} disabled={!email.trim() || !password} testID="login-submit" />
            <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(`${WEB_BASE}/forgot-password`)} style={{ alignSelf: 'center', padding: 8 }}>
              <Text size="sm" tone="accent">
                {t('login.forgot')}
              </Text>
            </Pressable>
          </View>
        )}

        {!mfa && (
          <View style={{ alignItems: 'center', gap: 4, marginTop: 8 }}>
            <Text size="sm" tone="muted">
              {t('login.noAccount')}
            </Text>
            <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(`${WEB_BASE}/register`)} style={{ padding: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text size="sm" tone="accent" weight="medium">
                {t('login.register')}
              </Text>
              <Icon name="external-link" size={14} color={c.accentText} />
            </Pressable>
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
