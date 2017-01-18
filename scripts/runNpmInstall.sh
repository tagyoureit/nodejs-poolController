#!/bin/bash

#************************************************#
#         Install NPM in a wrapper               #
#           written by Russ Goldin               #
#                                                #
#************************************************#


# --------------------------------------------------------- #
# calls NPM install ()                                      #
#                 #
#                              #
# Returns: 0 on success, $E_BADDIR if something went wrong. #
# --------------------------------------------------------- #
run_install ()
{

    echo "Running NPM install"


  npm install > result.txt
  cat result.txt
  return 0   # Success.
}

run_install

exit $?
