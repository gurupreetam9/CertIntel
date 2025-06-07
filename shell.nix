{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs_20  # Or your Node.js version
    pkgs.yarn       # Or your package manager
    pkgs.cairo
    pkgs.pango
    pkgs."pkg-config"  # note the dash instead of no dash
    pkgs.util-linux
    pkgs.libuuid
    pkgs.libjpeg
    pkgs.giflib
    pkgs.librsvg
    pkgs.libuuid
  ];

shellHook = ''
  export LD_LIBRARY_PATH=${pkgs.util-linux}/lib$${LD_LIBRARY_PATH:+:}$${LD_LIBRARY_PATH}
'';


}
