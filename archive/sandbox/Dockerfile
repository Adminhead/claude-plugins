# Claude sandbox image. Build context is this directory; sandbox/check.sh builds and tests it.
FROM debian:trixie-slim@sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Versions come from the digest-pinned trixie base, so apt packages are not pinned one by one.
# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash ca-certificates curl git gnupg openssh-client less procps psmisc iproute2 jq ripgrep \
      fd-find tmux git-delta unzip xz-utils zstd file patch build-essential pkg-config python3 \
      sqlite3 locales \
 && rm -rf /var/lib/apt/lists/* \
 && ln -s /usr/bin/fdfind /usr/local/bin/fd \
 && sed -i 's/^# *en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen \
 && locale-gen

COPY --from=jdxcode/mise:2026.10.10@sha256:413d4a27f8a1a75edf87451b7a0e74a9c38a0348ce6760068fbcd0c3df6e0bad /usr/local/bin/mise /usr/local/bin/mise
COPY mise.toml /etc/mise/config.toml
RUN mise install --system \
 && mise reshim --system \
 && rm -rf /root/.cache/mise

# A login name, not a credential.
# hadolint ignore=DL3064
ARG USERNAME
ARG UID
ARG GID
ENV HOME=/home/${USERNAME}
RUN : "${USERNAME:?}" "${UID:?}" "${GID:?}" \
 && groupadd -g "$GID" "$USERNAME" \
 && useradd -l -m -u "$UID" -g "$GID" -s /bin/bash "$USERNAME" \
 && mkdir -p \
      "$HOME/.local/bin" "$HOME/.local/share/mise" "$HOME/.local/state/mise" \
      "$HOME/.config" "$HOME/.cache" "$HOME/.claude" "$HOME/.claude-mem" \
 && chown -R "$UID:$GID" "$HOME"

# Debian's /etc/profile resets PATH for login shells (`bash -l`, `--shell`); restore the ENV PATH dirs.
# The single quotes keep $HOME and $PATH for the login shell to expand.
# hadolint ignore=SC2016
RUN printf '%s\n' 'PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:/usr/local/share/mise/shims:$PATH"' \
      > /etc/profile.d/sandbox-path.sh

# apt's signed-by trusts every key in the file, so the download must hold exactly one primary key,
# Anthropic's, and only that key is exported to the keyring. gpg runs in a throwaway homedir.
ARG CLAUDE_VERSION
RUN : "${CLAUDE_VERSION:?set --build-arg CLAUDE_VERSION}" \
 && key=31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE \
 && gnupg=$(mktemp -d) \
 && curl -fsSL https://downloads.claude.ai/keys/claude-code.asc -o "$gnupg/download.asc" \
 && primaries=$(gpg --homedir "$gnupg" --show-keys --with-colons "$gnupg/download.asc" \
      | awk -F: '/^pub:/ {p = 1; next} /^fpr:/ && p {print $10; p = 0}') \
 && { [ "$primaries" = "$key" ] || { echo "claude-code key file must hold only $key, got: $primaries" >&2; exit 1; }; } \
 && gpg --homedir "$gnupg" --quiet --import "$gnupg/download.asc" \
 && install -d -m 0755 /etc/apt/keyrings \
 && gpg --homedir "$gnupg" --armor --export "$key" > /etc/apt/keyrings/claude-code.asc \
 && rm -rf "$gnupg" \
 && echo "deb [signed-by=/etc/apt/keyrings/claude-code.asc] https://downloads.claude.ai/claude-code/apt/latest latest main" \
      > /etc/apt/sources.list.d/claude-code.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends "claude-code=${CLAUDE_VERSION}-1" \
 && rm -rf /var/lib/apt/lists/*

ENV PATH=${HOME}/.local/bin:${HOME}/.local/share/mise/shims:/usr/local/share/mise/shims:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    DISABLE_AUTOUPDATER=1 \
    CLAUDE_CONFIG_DIR=${HOME}/.claude \
    DEVCONTAINER=true
COPY --chmod=0755 entrypoint.sh /usr/local/bin/sandbox-entry

USER ${UID}:${GID}
WORKDIR ${HOME}
ENTRYPOINT ["/usr/local/bin/sandbox-entry"]
CMD ["bash", "-l"]
