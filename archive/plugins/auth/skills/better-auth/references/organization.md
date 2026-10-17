# Better Auth organization plugin

Read this when adding organizations, members, invitations, roles and permissions, or teams. Details come from the Better Auth 1.7 docs (`plugins/organization`). The docs hold the full option list, so check them for exact names and defaults on the installed version.

## Setup

1. Add `organization()` to the server `plugins` (from `better-auth/plugins`) and `organizationClient()` to the client (from `better-auth/client/plugins`).
2. Regenerate and apply the schema. The plugin adds organization, member, and invitation tables (and team tables when teams are on).
3. Verify that those tables exist.

Limits and creation policy are plugin options. `allowUserToCreateOrganization` takes a boolean or a function of the user (default `true`). `organizationLimit` caps organizations per user (unlimited by default). `membershipLimit` caps members per organization (default 100). Each accepts a function, so a plan or verification status can set the limit. Gate creation on a verified email when organizations are sensitive.

## Active organization

`organization.setActive({ organizationId })` stores the active organization in the session, and endpoints such as `listMembers` and `inviteMember` use it when no `organizationId` is passed. Don't treat the active organization as authorization. Check membership and permission for the organization in each request, with `auth:auth` section 4.

## Members and invitations

- Add members from trusted server code with `auth.api.addMember`. From the client, use invitations.
- Provide `sendInvitationEmail` before using invitations. It receives the invitation, organization, and inviter, and builds the link with the invitation ID. As with other mail, don't await a slow send in the response path.
- `invitationExpiresIn` is in seconds and defaults to 48 hours. `invitationLimit` caps invitations per user (default 100). `cancelPendingInvitationsOnReInvite` defaults to `false`.
- Accepting an invitation needs the invitation ID and a signed-in session whose email matches the invitation. With the built-in opaque IDs that is enough. If IDs are predictable (`generateId: "serial"` or `false`, or custom generation), Better Auth also requires a verified email unless you set `requireEmailVerificationOnInvitation: false`. Set it to `true` when invitation IDs can leave the invitee's mailbox, when members can list invitations, or when unverified password sessions are allowed.
- `getInvitationURL` returns a shareable link and doesn't call `sendInvitationEmail`, so delivery and its exposure are yours to handle.
- Keep an owner in every organization. Transfer ownership by promoting another member before demoting or removing the current owner, and test the rule your configuration enforces.
- Deleting an organization removes its members, invitations, and teams. Set `disableOrganizationDeletion: true`, or use the `beforeDeleteOrganization` entry of `organizationHooks` for archiving, when deletion needs a safeguard.

## Roles and permissions

The default roles are `owner`, `admin`, and `member`. To define your own resources and actions:

1. Create the access controller with `createAccessControl(statement)`, where `statement` maps each resource to its action list, declared `as const`. Import it from `better-auth/plugins/access`, which the docs recommend over `better-auth/plugins` to keep bundles small.
2. Build roles with `ac.newRole({ ... })`.
3. Pass `ac` and `roles` to both `organization()` and `organizationClient()`.

Check permissions with `hasPermission`, which runs on the server (`auth.api.hasPermission`) or through the client call. Use `checkRolePermission` only for synchronous UI hints, since it knows static roles and not dynamic ones. Enforce on the server regardless of what the UI hides.

Dynamic access control lets organizations create roles at runtime. Turn it on with `dynamicAccessControl: { enabled: true }` on both the server and client plugins, then manage roles with `createRole`, `updateRole`, and `deleteRole`. It adds a table, so refresh the schema. Roles that are assigned to members can't be deleted.

## Teams

Enable with `teams: { enabled: true }`, optionally with `maximumTeams` and `allowRemovingAllTeams: false`. A user must be an organization member before joining a team. Set the active team with `setActiveTeam`.

## Hooks and schema

The `organizationHooks` option (the older `organizationCreation` hooks are deprecated) runs callbacks before and after organization, member, invitation, and team operations, such as `beforeDeleteOrganization` and `afterAcceptInvitation`. Use them for audit events and validation. Customize table and field names, or add fields, under the plugin's `schema` option, then regenerate the schema.

## Check

Test cross-organization denial (a member of A can't read or change B), each role's allowed and denied actions, invitation acceptance with a mismatched email, an expired invitation, and removal of the last owner.
