/**
 * Every namespace for English, in a module of its own so a page ships
 * only the language it is shown in; the other is fetched when someone switches.
 */
import enCommon from '@/locales/en/common.json';
import enNav from '@/locales/en/nav.json';
import enAuth from '@/locales/en/auth.json';
import enLanding from '@/locales/en/landing.json';
import enDashboard from '@/locales/en/dashboard.json';
import enCards from '@/locales/en/cards.json';
import enCardEditor from '@/locales/en/cardEditor.json';
import enProfiles from '@/locales/en/profiles.json';
import enSmartIdentity from '@/locales/en/smartIdentity.json';
import enLinkBuilder from '@/locales/en/linkBuilder.json';
import enPaymentLinks from '@/locales/en/paymentLinks.json';
import enNfc from '@/locales/en/nfc.json';
import enQr from '@/locales/en/qr.json';
import enCrm from '@/locales/en/crm.json';
import enAnalytics from '@/locales/en/analytics.json';
import enOrganizations from '@/locales/en/organizations.json';
import enTeams from '@/locales/en/teams.json';
import enBilling from '@/locales/en/billing.json';
import enAdmin from '@/locales/en/admin.json';
import enIntegrations from '@/locales/en/integrations.json';
import enNotifications from '@/locales/en/notifications.json';
import enSettings from '@/locales/en/settings.json';

const en = {
  common: enCommon,
  nav: enNav,
  auth: enAuth,
  landing: enLanding,
  dashboard: enDashboard,
  cards: enCards,
  cardEditor: enCardEditor,
  profiles: enProfiles,
  smartIdentity: enSmartIdentity,
  linkBuilder: enLinkBuilder,
  paymentLinks: enPaymentLinks,
  nfc: enNfc,
  qr: enQr,
  crm: enCrm,
  analytics: enAnalytics,
  organizations: enOrganizations,
  teams: enTeams,
  billing: enBilling,
  admin: enAdmin,
  integrations: enIntegrations,
  notifications: enNotifications,
  settings: enSettings,
};

export default en;
