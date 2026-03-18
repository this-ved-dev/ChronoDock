{
  "targets": [
    {
      "target_name": "pin-to-desktop",
      "sources": [
        "pin-to-desktop.cc"
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      "libraries": [
        "-luser32.lib",
        "-lshell32.lib"
      ],
      "conditions": [
        ["OS=='win'", {
          "defines": [
            "WIN32_LEAN_AND_MEAN",
            "UNICODE",
            "_UNICODE"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/EHsc"]
            }
          }
        }]
      ]
    }
  ]
}
