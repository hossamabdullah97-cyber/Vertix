/**
 * Field mapping for CRM sync (section 6). A mapping is Vertex-field → CRM-field.
 * Applying it against a lead produces the properties payload the CRM expects.
 * Pure and testable — the mapping logic is the same everywhere.
 */
export type FieldMapping = Record<string, string>;

/** A Vertex lead, as far as sync cares. */
export interface SyncableLead {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  source?: string | null;
  temperature?: string | null;
}

/** The default Vertex → HubSpot contact-property mapping. */
export const DEFAULT_HUBSPOT_MAPPING: FieldMapping = {
  firstName: 'firstname',
  lastName: 'lastname',
  email: 'email',
  phone: 'phone',
  company: 'company',
};

/** Vertex → Salesforce Lead fields (LastName and Company are filled in when missing). */
export const DEFAULT_SALESFORCE_MAPPING: FieldMapping = {
  firstName: 'FirstName',
  lastName: 'LastName',
  email: 'Email',
  phone: 'Phone',
  company: 'Company',
};

/** Vertex → Zoho CRM Lead fields. */
export const DEFAULT_ZOHO_MAPPING: FieldMapping = {
  firstName: 'First_Name',
  lastName: 'Last_Name',
  email: 'Email',
  phone: 'Phone',
  company: 'Company',
};

/** Vertex → Pipedrive Person (org_name becomes the person's organization). */
export const DEFAULT_PIPEDRIVE_MAPPING: FieldMapping = {
  fullName: 'name',
  email: 'email',
  phone: 'phone',
  company: 'org_name',
};

/** Vertex → Mailchimp member (email_address, then the audience's merge tags). */
export const DEFAULT_MAILCHIMP_MAPPING: FieldMapping = {
  email: 'email_address',
  firstName: 'FNAME',
  lastName: 'LNAME',
  phone: 'PHONE',
};

/** Vertex → Dynamics 365 Lead columns. */
export const DEFAULT_DYNAMICS_MAPPING: FieldMapping = {
  firstName: 'firstname',
  lastName: 'lastname',
  email: 'emailaddress1',
  phone: 'mobilephone',
  company: 'companyname',
};

/** The Vertex fields that can be mapped, with how each is derived from a lead. */
export function vertexFieldValue(lead: SyncableLead, field: string): string | undefined {
  switch (field) {
    case 'firstName':
      return (lead.name ?? '').trim().split(/\s+/)[0] || undefined;
    case 'lastName': {
      const parts = (lead.name ?? '').trim().split(/\s+/);
      return parts.length > 1 ? parts.slice(1).join(' ') : undefined;
    }
    case 'fullName':
      return lead.name ?? undefined;
    case 'email':
      return lead.email ?? undefined;
    case 'phone':
      return lead.phone ?? undefined;
    case 'company':
      return lead.company ?? undefined;
    case 'source':
      return lead.source ?? undefined;
    case 'temperature':
      return lead.temperature ?? undefined;
    default:
      return undefined;
  }
}

export const MAPPABLE_VERTEX_FIELDS = [
  'firstName',
  'lastName',
  'fullName',
  'email',
  'phone',
  'company',
  'source',
  'temperature',
] as const;

/**
 * Applies a mapping to a lead, producing the CRM properties object. Fields with
 * no value are omitted so the sync never overwrites a CRM field with a blank.
 */
export function applyMapping(lead: SyncableLead, mapping: FieldMapping): Record<string, string> {
  const props: Record<string, string> = {};
  for (const [vertexField, crmField] of Object.entries(mapping)) {
    const value = vertexFieldValue(lead, vertexField);
    if (value !== undefined && value !== '' && crmField) {
      props[crmField] = value;
    }
  }
  return props;
}
