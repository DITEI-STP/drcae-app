const COMPLAINT_PAGE = 'app:page:complaints';
const COMPLAINT_VERIFY = 'app:transaction:complaint:verify';
const INSPECTION_PAGE = 'app:page:inspections';
const INSPECTION_CREATE = 'app:transaction:inspection:create';

function isLegacyFieldAgent(grants: readonly string[]): boolean {
  return grants.includes(INSPECTION_PAGE) && grants.includes(INSPECTION_CREATE);
}

export function canReadReleasedComplaints(grants: readonly string[]): boolean {
  return grants.includes(COMPLAINT_PAGE) || isLegacyFieldAgent(grants);
}

export function canVerifyReleasedComplaint(grants: readonly string[]): boolean {
  return grants.includes(COMPLAINT_VERIFY) || isLegacyFieldAgent(grants);
}
