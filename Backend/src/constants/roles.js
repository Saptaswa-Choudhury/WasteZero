const ROLES = {
  VOLUNTEER: 'volunteer',
  NGO: 'ngo',
  ADMIN: 'admin'
};

const ROLES_ARRAY = Object.values(ROLES);
const REGISTERABLE_ROLES = [ROLES.VOLUNTEER, ROLES.NGO];

module.exports = { ROLES, ROLES_ARRAY, REGISTERABLE_ROLES };
