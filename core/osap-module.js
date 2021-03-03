/*
osap-module.js

probably a group of endpoints / associated software 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2021

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import Endpoint from "./osap-endpoint.js"

export default function Module(osap){
    throw new Error("unwritten")
    // but should have like 
    this.objects = [] 
    this.endpoint = () => {
        let ep = new Endpoint(this)
        ep.indice = this.objects.length 
        this.objects.push(ep)
        return ep 
    }
}