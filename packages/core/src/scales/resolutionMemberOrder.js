/**
 * @param {{ view: { getPathString(): string }, channel?: string }} member
 */
function memberKey(member) {
    const path = member.view.getPathString();
    const channel = member.channel ?? "";
    return path + "|" + channel;
}

/**
 * Stable ordering for resolution members so merge behavior does not depend on
 * registration order.
 *
 * @template {{ view: { getPathString(): string }, channel?: string }} T
 * @param {Set<T> | Iterable<T>} members
 * @returns {T[]}
 */
export function orderResolutionMembers(members) {
    return Array.from(members).sort((a, b) =>
        memberKey(a).localeCompare(memberKey(b))
    );
}
