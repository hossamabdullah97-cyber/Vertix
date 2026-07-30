/**
 * Bundles every namespace JSON into the i18next `resources` shape. Statically
 * imported so translations ship in the client bundle (instant switching, no
 * async fetch) and missing files fail loudly at build time.
 *
 * When you add a namespace to NAMESPACES in ./config, add its two imports here.
 */
import type { Resource } from 'i18next';

import enCommon from '@/locales/en/common.json';
import enNav from '@/locales/en/nav.json';
import enAuth from '@/locales/en/auth.json';
import enDashboard from '@/locales/en/dashboard.json';
import enCards from '@/locales/en/cards.json';
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
import enAdmin from '@/locales/en/admin.json';
import enIntegrations from '@/locales/en/integrations.json';
import enNotifications from '@/locales/en/notifications.json';
import enSettings from '@/locales/en/settings.json';

import arCommon from '@/locales/ar/common.json';
import arNav from '@/locales/ar/nav.json';
import arAuth from '@/locales/ar/auth.json';
import arDashboard from '@/locales/ar/dashboard.json';
import arCards from '@/locales/ar/cards.json';
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
import arAdmin from '@/locales/ar/admin.json';
import arIntegrations from '@/locales/ar/integrations.json';
import arNotifications from '@/locales/ar/notifications.json';
import arSettings from '@/locales/ar/settings.json';

export const resources: Resource = {
  en: {
    common: enCommon,
    nav: enNav,
    auth: enAuth,
    dashboard: enDashboard,
    cards: enCards,
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
    admin: enAdmin,
    integrations: enIntegrations,
    notifications: enNotifications,
    settings: enSettings,
  },
  ar: {
    common: arCommon,
    nav: arNav,
    auth: arAuth,
    dashboard: arDashboard,
    cards: arCards,
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
    admin: arAdmin,
    integrations: arIntegrations,
    notifications: arNotifications,
    settings: arSettings,
  },
};
