import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from '@biasmarket/i18n';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));

const { default: Page } = await import('../app/[locale]/page');

test('Page', () => {
  render(
    <NextIntlClientProvider locale="es" messages={getMessages('es')}>
      <Page />
    </NextIntlClientProvider>,
  );
  expect(
    screen.getByRole('heading', {
      level: 1,
      name: /photocards/i,
    }),
  ).toBeDefined();
});
