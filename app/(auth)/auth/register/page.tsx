import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RegisterForm } from './register-form';

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Реєстрація</CardTitle>
        <CardDescription>Створіть акаунт для відстеження портфеля</CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
        <p className="mt-6 text-center text-sm text-text-muted">
          Вже маєте акаунт?{' '}
          <Link className="text-primary hover:underline" href="/auth/login">
            Увійти
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
