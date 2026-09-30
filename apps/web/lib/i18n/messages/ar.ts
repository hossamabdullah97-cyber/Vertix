/**
 * Every namespace for Arabic, in a module of its own so a page ships
 * only the language it is shown in; the other is fetched when someone switches.
 */
import arCommon from '@/locales/ar/common.json';
import arNav from '@/locales/ar/nav.json';
import arAuth from '@/locales/ar/auth.json';
import arLanding from '@/locales/ar/landing.json';
import arDashboard from '@/locales/ar/dashboard.json';
import arCards from '@/locales/ar/cards.json';
import arCardEditor from '@/locales/ar/cardEditor.json';
import arProfiles from '@/locales/ar/profiles.json';
import arSmartIdentity from '@/locales/ar/smartIdentity.json';
import arLinkBuilder from '@/locales/ar/linkBuilder.json';
import arPaymentLinks from '@/locales/ar/paymentLinks.json';
import arNfc from '@/locales/ar/nfc.json';
import arQr from '@/locales/ar/qr.json';
import arCrm from '@/locales/ar/crm.json';
import arAnalytics from '@/locales/ar/analytics.json';
import arOrganizations from '@/locales/ar/organizations.json';
import arTeams from '@/locales/ar/teams.json';
import arBilling from '@/locales/ar/billing.json';
import arAdmin from '@/locales/ar/admin.json';
import arIntegrations from '@/locales/ar/integrations.json';
import arNotifications from '@/locales/ar/notifications.json';
import arSettings from '@/locales/ar/settings.json';

const ar = {
  common: arCommon,
  nav: arNav,
  auth: arAuth,
  landing: arLanding,
  dashboard: arDashboard,
  cards: arCards,
  cardEditor: arCardEditor,
  profiles: arProfiles,
  smartIdentity: arSmartIdentity,
  linkBuilder: arLinkBuilder,
  paymentLinks: arPaymentLinks,
  nfc: arNfc,
  qr: arQr,
  crm: arCrm,
  analytics: arAnalytics,
  organizations: arOrganizations,
  teams: arTeams,
  billing: arBilling,
  admin: arAdmin,
  integrations: arIntegrations,
  notifications: arNotifications,
  settings: arSettings,
};

export default ar;
