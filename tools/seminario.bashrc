# Carregado pelo terminal dos slides (bash --rcfile). Mantém o seu ~/.bashrc
# e acrescenta o comando `chat` e um prompt no estilo do Git Bash.
[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"
export PATH="$SEMINARIO_ROOT/bin:$PATH"
cd "$SEMINARIO_ROOT" 2>/dev/null
PS1='\[\e[32m\]\u@seminario \[\e[35m\]MINGW64 \[\e[33m\]\w\[\e[0m\]\n\$ '
clear
printf '\e[90m# terminal do seminário (%s) · comandos: chat online · chat local · exit\e[0m\n' "$SEMINARIO_TAG"
