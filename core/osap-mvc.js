/*
osap-mvc.js

osap / model-view-controller elements 

Jake Read at the Center for Bits and Atoms
(c) Massachusetts Institute of Technology 2020

This work may be reproduced, modified, distributed, performed, and
displayed for any purpose, but must acknowledge the open systems assembly protocol (OSAP) project.
Copyright is retained and must be preserved. The work is provided as is;
no warranty is provided, and users accept all liability.
*/

import { PK, DK, EP, TS, TIMES } from './ts.js'

export default function MVC(osap, TIMEOUT, LOGRX, LOGTX) {
    // ------------------------------------------------------ PING 
    // route arguments are uint8array's & contain no ptr, 1st term is outgoing
    let nextPingID = 1001
    let incrementPingId = () => {
        nextPingID++
        if (nextPingID > 65535) nextPingID = 0
    }
    let pingReqs = []

    osap.ping = (route) => {
        return new Promise((resolve, reject) => {
            if (LOGTX) console.log('TX: Ping: begin')
            // our payload is like,
            let pingReq = new Uint8Array(3)
            pingReq[0] = DK.PINGREQ
            TS.write('uint16', nextPingID, pingReq, 1, true)
            // that's the datagram, 
            // code mechanisms (to issue callbacks)
            let rejected = false
            // ship it
            if (LOGTX) console.log('TX: Ping: sending')
            osap.send(route, pingReq).then(() => {
                // on send success, add to list of watchers 
                pingReqs.push({
                    id: nextPingID,
                    startTime: osap.getTimeStamp(),
                    resolve: (res) => { if (!rejected) resolve(res) }
                })
                // increment req nums
                incrementPingId()
                // set a timeout, in case it never returns 
                // TODO: should clear from pingReqs on failure
                setTimeout(() => {
                    rejected = true
                    reject(`ping timeout to ${route.path}`)
                }, TIMEOUT)
            }).catch((err) => {
                rejected = true
                console.error(err)
                reject(`ping tx error`)
            })
        })
    }

    // *requests to us* to ping
    osap.handlePingRequest = (pck, ptr) => {
        // we can only flush this from our rx buffer if we are clear to send back up the vp
        // this will keep it in the buffer, this will be called again after others clear
        if (!pck.vp.cts()) {
            if (!pck.vp.status() != EP.PORTSTATUS.OPEN) { // if it's not even open, bail 
                if (LOGERRPOPS) console.log('popping ping request - port to respond on is doa')
                pck.vp.clear()
            }
            return
        }
        // are about to transmit this out, so we can clear it now
        pck.vp.clear()
        // generate the reply, ship it
        let pingReply = new Uint8Array(3)
        pingReply[0] = DK.PINGRES
        pingReply[1] = pck.data[ptr + 1] // same ID,
        pingReply[2] = pck.data[ptr + 2]
        // get a reversed route to reply with, 
        let route = osap.reverseRoute(pck)
        // transmit the response 
        osap.send(route, pingReply).then(() => {
            // all good, 
        }).catch((err) => {
            console.error(err)
        })
    }

    // *responses* to our pings, pck.data[ptr] == DK.PINGRES
    osap.handlePingResponse = (pck, ptr) => {
        // the ping id, 
        let id = TS.read('uint16', pck.data, ptr + 1, true)
        // find it 
        for (let ping of pingReqs) {
            if (ping.id == id) {
                ping.resolve({
                    route: {
                        path: pck.data.slice(0, ptr - 9),
                        segsize: TS.read('uint16', pck.data, ptr - 4, true)
                    },
                    time: osap.getTimeStamp() - ping.startTime
                })
            }
        }
        // clear the packet 
        pck.vp.clear()
    }
    // ------------------------------------------------------ ENTRY PORT 

    let nextEntryPortID = 3003
    let incrementEntryPortID = () => {
        nextEntryPortID++
        if (nextEntryPortID > 65535) nextEntryPortID = 0
    }
    let entryPortReqs = []

    osap.readEntryPort = (route) => {
        return new Promise((resolve, reject) => {
            if (LOGTX) console.log('TX: Read Entry Port: begin')
            let epReq = new Uint8Array(3)
            epReq[0] = DK.EPREQ
            TS.write('uint16', nextEntryPortID, epReq, 1, true)
            let rejected = false
            osap.send(route, epReq).then(() => {
                entryPortReqs.push({
                    id: nextEntryPortID,
                    resolve: (res) => { if (!rejected) resolve(res) }
                })
                incrementEntryPortID()
                setTimeout(() => {
                    rejected = true
                    reject(`entry port req timeout to ${route.path}`)
                }, TIMEOUT)
            }).catch((err) => {
                rejected = true
                console.error(err)
                reject(`entry port request tx error`)
            })
        })
    }

    osap.handleEntryPortRequest = (pck, ptr) => {
        if (!pck.vp.cts()) {
            if (!pck.vp.status() != EP.PORTSTATUS.OPEN) {
                if (LOGERRPOPS) console.log('popping entry port request - port to respond on is doa')
                pck.vp.clear()
            }
            return
        }
        // are about to transmit this out, so we can clear it now
        pck.vp.clear()
        // generate the reply, ship it
        let epReply = new Uint8Array(5)
        epReply[0] = DK.EPRES
        epReply[1] = pck.data[ptr + 1] // same ID,
        epReply[2] = pck.data[ptr + 2]
        TS.write('uint16', pck.vp.ownIndice(), epReply, 3, true)
        // get a reversed route to reply with, 
        let route = osap.reverseRoute(pck)
        // transmit the response 
        osap.send(route, epReply).then(() => {
            // all good, 
        }).catch((err) => {
            console.error(err)
        })
    }

    osap.handleEntryPortResponse = (pck, ptr) => {
        // the ping id, 
        let id = TS.read('uint16', pck.data, ptr + 1, true)
        let portIndice = TS.read('uint16', pck.data, ptr + 3, true)
        // clear the packet 
        pck.vp.clear()
        // find it 
        for (let ep of entryPortReqs) {
            if (ep.id == id) {
                ep.resolve(portIndice)
                return
            }
        }
    }

    // ------------------------------------------------------ MVC WORK
    // all mvc messages can receive a similar set of errmessages,
    // and we'll ID them together as well, then we can handle all
    // responses and possible errors through one pipe,
    let nextMvcID = 2002
    let incrementMvcID = () => {
        nextMvcID++
        if (nextMvcID > 65535) nextMvcID = 0
    }
    let mvcReqs = []

    // ------------------------------------------------------ MAKE A READ REQUEST
    // route: {path: bytes-to-endpoint, segsize: max. seglength for packets on this route}
    // then use function built-in arguments object for an array of endpoints to query for here,
    osap.read = (route, ...items) => {
        return new Promise((resolve, reject) => {
            // we are an outgoing read request,
            let req = [DK.RREQ, nextMvcID & 255, (nextMvcID >> 8) & 255]
            // items -> uppercase,
            // write out a packet of endpoint keys for each item
            // if ever find an error, we terminate the list
            for (let i = 0; i < items.length; i++) {
                if (EP[items[i].toUpperCase()]) {
                    if (EP[items[i].toUpperCase()].ISDIVE) {
                        // tree depth jump, provide indice
                        if (typeof items[i + 1] !== 'number') {
                            reject('requested indice-selecting information, did not provide indice, check query arguments')
                            return
                        } else {
                            req.push(EP[items[i].toUpperCase()].KEY, items[i + 1] & 255, (items[i + 1] >> 8) & 255)
                            i++
                        }
                    } else {
                        if (EP[items[i].toUpperCase()].KEY == EP.PORTSTATUS.KEY) {
                            // port status, we query a particular drop 
                            req.push(EP.PORTSTATUS.KEY, items[i + 1] & 255, (items[i + 1] >> 8) & 255)
                            i++
                        } else {
                            req.push(EP[items[i].toUpperCase()].KEY)
                        }
                    }
                } else {
                    reject('unrecognized key requested in call to query, check arguments')
                    return
                }
            } // finish loop over items
            // packetize and ship-it
            req = Uint8Array.from(req)
            let rejected = false
            osap.send(route, req).then(() => {
                // add to listeners
                mvcReqs.push({
                    id: nextMvcID,
                    items: items,
                    response: (res) => {
                        if (!rejected) resolve(res)
                    },
                    reject: (msg) => {
                        if (!rejected) reject(msg)
                    }
                })
                // increment req id
                incrementMvcID()
                // timeout queries 
                setTimeout(() => {
                    rejected = true
                    reject(`query request timeout to ${route.path}`)
                }, TIMEOUT)
            }).catch((err) => {
                console.error(err)
                reject(`query request tx error`)
            })
        })
    } // end query

    // ------------------------------------------------------ HANDLE INCOMING READ REQUESTS
    // pck.data[ptr] = DK.RREQ
    osap.handleReadRequest = (pck, rptr) => {
        // id's, all of them:
        if (LOGRX) console.log("HANDLE READ REQ")
        // if the response path isn't clear, we should exit and leave it in the buffer for next loop,
        if (!pck.vp.cts()) {
            if (!pck.vp.phy.status() != EP.PORTSTATUS.OPEN) {
                if (LOGERRPOPS) console.log('popping read request - port to respond on is doa')
                pck.vp.clear()
            }
            return
        }
        // we're ready to respond, so we can prep the reverse route, to know allowable return size
        pck.vp.clear()
        let route = osap.reverseRoute(pck)
        // start response to this read w/ the read-response key, and copy in the id from the packet,
        let reply = new Uint8Array(8192)
        reply[0] = DK.RRES
        reply[1] = pck.data[rptr + 1]
        reply[2] = pck.data[rptr + 2]
        // now we walk for keys,
        rptr += 3 // read-ptr now at first endpoint key,
        let wptr = 3 // write-ptr at end of our current reply,
        let obj = osap // at the head, we are querying the osap node itself,
        let indice = null
        // walk ptrs, max 32 queries in one packet, arbitrary
        keywalk: for (let i = 0; i < 32; i++) {
            // if we've written past the allowable return length, query needs to be finer grained
            if (wptr + route.path.length > route.segsize) {
                console.log("QUERY DOWN")
                reply[3] = EP.ERR.KEY
                reply[4] = EP.ERR.KEYS.QUERYDOWN
                wptr = 5
                break keywalk;
            }
            // if we've read past the end of the request, we're done
            if (rptr >= pck.data.length) {
                if (LOGRX) console.log("READ REQ COMPLETE")
                break keywalk;
            }
            // to write in null-returns
            let writeEmpty = () => {
                reply[wptr++] = EP.ERR.KEY
                reply[wptr++] = EP.ERR.KEYS.EMPTY
            }
            // ok, walk those keys
            switch (pck.data[rptr]) {
                // ---------------------------------------------------------- DIVES
                // first up, handle dives, which select down- the tree
                case EP.VPORT.KEY:
                    indice = TS.read('uint16', pck.data, rptr + 1, true)
                    if (osap.vPorts[indice] && obj == osap) { // only if it exists, and only exists at node level
                        obj = osap.vPorts[indice] // select this for next queries,
                        reply[wptr++] = EP.VPORT.KEY // identify that the response's next items are for this item,
                        reply[wptr++] = pck.data[rptr + 1]
                        reply[wptr++] = pck.data[rptr + 2]
                        rptr += 3
                    } else {
                        writeNull()
                        break keywalk; // this is terminal for the key walk: succeeding arguments are now null
                    }
                    break;
                case EP.VMODULE.KEY:
                    indice = TS.read('uint16', pck.data, rptr + 1, true)
                    if (osap.vModules[indice] && obj == osap) {
                        obj = osap.vModules[indice] // select this for next queries,
                        reply[wptr++] = EP.VMODULE.KEY
                        reply[wptr++] = pck.data[rptr + 1]
                        reply[wptr++] = pck.data[rptr + 2]
                        rptr += 3
                    } else {
                        writeEmpty()
                        break keywalk; // this is terminal for the key walk: succeeding arguments are now null
                    }
                    break;
                case EP.INPUT.KEY:
                    indice = TS.read('uint16', pck.data, rptr + 1, true)
                    if (obj.inputs && obj.inputs[indice]) {
                        obj = obj.inputs[indice]
                        reply[wptr++] = EP.INPUT.KEY
                        reply[wptr++] = pck.data[rptr + 1]
                        reply[wptr++] = pck.data[rptr + 2]
                        rptr += 3
                    } else {
                        writeEmpty()
                        break keywalk; // this is terminal for the key walk: succeeding arguments are now null
                    }
                    break;
                case EP.OUTPUT.KEY:
                    indice = TS.read('uint16', pck.data, rptr + 1, true)
                    if (obj.outputs && obj.outputs[indice]) {
                        reply[wptr++] = EP.OUTPUT.KEY
                        reply[wptr++] = pck.data[rptr + 1]
                        reply[wptr++] = pck.data[rptr + 2]
                        rptr += 3
                    } else {
                        writeEmpty()
                        break keywalk; // this is terminal for the key walk: succeeding arguments are now null
                    }
                    break;
                case EP.ROUTE.KEY:
                    indice = TS.read('uint16', pck.data, rptr + 1, true)
                    if (obj.routes && obj.routes[indice]) {
                        reply[wptr++] = EP.ROUTE.KEY
                        reply[wptr++] = pck.data[rptr + 1]
                        reply[wptr++] = pck.data[rptr + 2]
                        rptr += 3
                    } else {
                        writeEmpty()
                        break keywalk; // this is terminal for the key walk: succeeding arguments are now null
                    }
                    break;
                // -------------------------------------------------------- COUNTS
                // now, handle all counts-of-things:
                case EP.NUMVPORTS.KEY:
                    if (obj == osap) {
                        reply[wptr++] = EP.NUMVPORTS.KEY
                        wptr += TS.write('uint16', osap.vPorts.length, reply, wptr, true)
                        rptr++
                    } else { // only the node has a list of vPorts & vModules,
                        writeEmpty()
                        rptr++
                    }
                    break;
                case EP.NUMVMODULES.KEY:
                    if (obj == osap) {
                        reply[wptr++] = EP.NUMVMODULES.KEY
                        wptr += TS.write('uint16', osap.vModules.length, reply, wptr, true)
                        rptr++
                    } else { // only the node has a list of vPorts & vModules,
                        writeEmpty()
                        rptr++
                    }
                    break;
                case EP.NUMINPUTS.KEY:
                    if (obj.inputs) {
                        reply[wptr++] = EP.NUMINPUTS.KEY
                        wptr += TS.write('uint16', obj.inputs.length, reply, wptr, true)
                        rptr++
                    } else { // only the node has a list of vPorts & vModules,
                        writeEmpty()
                        rptr++
                    }
                    break;
                case EP.NUMOUTPUTS.KEY:
                    if (obj.outputs) {
                        reply[wptr++] = EP.NUMOUTPUTS.KEY
                        wptr += TS.write('uint16', obj.outputs.length, reply, wptr, true)
                        rptr++
                    } else { // only the node has a list of vPorts & vModules,
                        writeEmpty()
                        rptr++
                    }
                    break;
                case EP.NUMROUTES.KEY:
                    if (obj.routes) {
                        reply[wptr++] = EP.NUMROUTES.KEY
                        wptr += TS.write('uint16', obj.routes.length, reply, wptr, true)
                        rptr++
                    } else { // only the node has a list of vPorts & vModules,
                        writeEmpty()
                        rptr++
                    }
                    break;
                // ---------------------------------------------------------- ENDPOINTS
                // now, handle all possible endpoint properties
                case EP.NAME.KEY: // everyone has 1
                    reply[wptr++] = EP.NAME.KEY
                    wptr += TS.write('string', obj.name, reply, wptr, true)
                    rptr++
                    break;
                case EP.DESCRIPTION.KEY:
                    if (obj.description) { // exists, write in
                        reply[wptr++] = EP.DESCRIPTION.KEY
                        wptr += TS.write('string', obj.description, reply, wptr, true)
                        rptr++
                    } else { // null key: this doesn't exist
                        writeEmpty()
                        rptr++
                    }
                    break;
                // ------------------------------------------------ PORT SPECIFIC
                case EP.PORTTYPEKEY.KEY:
                    if (obj.portTypeKey) {
                        reply[wptr++] = EP.PORTTYPEKEY.KEY
                        reply[wptr++] = obj.portTypeKey
                        rptr++
                    } else {
                        writeEmpty()
                        rptr++
                    }
                    break;
                case EP.MAXSEGLENGTH.KEY:
                    if (obj.portTypeKey) {
                        reply[wptr++] = EP.MAXSEGLENGTH.KEY
                        wptr += TS.write('uint32', obj.maxSegLength, reply, wptr, true)
                        rptr++
                    } else {
                        writeEmpty()
                        rptr++
                    }
                    break;
                case EP.MAXADDRESSES.KEY:
                    if (obj.portTypeKey) { // confirm is a vport
                        reply[wptr++] = EP.MAXADDRESSES.KEY
                        wptr += TS.write('uint16', obj.maxAddresses, reply, wptr, true)
                        rptr++
                    } else {
                        writeEmpty()
                        rptr++
                    }
                    break;
                case EP.PORTSTATUS.KEY: // this one has an argument: the rxAddr to query, 
                    if (obj.portTypeKey) {
                        let rxAddr = TS.read('uint16', pck.data, rptr + 1, true)
                        reply[wptr++] = EP.PORTSTATUS.KEY
                        reply[wptr++] = obj.status(rxAddr) // this is actually simply ignored in JS, where no busses yet
                        rptr += 3
                    } else {
                        writeEmpty()
                        rptr += 3
                    }
                    break;
                // ------------------------------------------------ INPUT / OUTPUT SPECIFIC
                case EP.TYPE.KEY:
                case EP.VALUE.KEY:
                case EP.STATUS.KEY:
                // ------------------------------------------------ OUTPUT SPECIFIC
                case EP.NUMROUTES.KEY:
                case EP.ROUTE.KEY:
                    writeEmpty()
                    rptr++
                    break;
                // ------------------------------------------------ DEFAULT
                // we don't know what this key is, at all,
                // unfortunately that means it might contain some indice following,
                // which could result in errors, so the whole message is cancelled
                // this will mean that all endpoints will have to at least recognize all keys...
                // here, the protocol is *close* to being an abstract model-retrieval and announcement,
                // but we'll see what happens with compound typing, perhaps provides a model for this as well
                // allowing us to discover arbitrary endpoint properties, dataflow or not...
                default:
                    console.log("READ REQ: NONRECOGNIZED KEY", pck.data[rptr], 'at rptr', rptr)
                    TS.logPacket(pck.data)
                    reply[3] = EP.ERR.KEY
                    reply[4] = EP.ERR.KEYS.UNCLEAR
                    wptr = 5
                    break keywalk;
            } // end switch
        } // end keywalk
        // reformat to fit length, 
        reply = Uint8Array.from(reply.subarray(0, wptr))
        // send along 
        osap.send(route, reply).then(() => {
            // OK, 
        }).catch((err) => {
            console.error(err)
            console.error(`query reply tx error`)
        })
    }

    // ------------------------------------------------------ HANDLE READ RESPONSES
    // pck.data[ptr] = DK.RRES
    osap.handleReadResponse = (pck, ptr) => {
        // all responses should have IDs trailing the D-Key, and should be associated w/ one we're tracking
        let id = TS.read('uint16', pck.data, ptr + 1, true)
        let tracked = mvcReqs.find((cand) => { return cand.id == id })
        ptr += 3
        pck.vp.clear() // errs or not, they all go home (to sleep, the long nap, may you meet the garbage collector in peace)
        // are we awaiting this resp? 
        if (!tracked) {
            if (LOGERRPOPS) console.error('response to untracked request, popping')
            console.log(mvcReqs)
            console.log('id', id)
            return
        }
        // pck.data[ptr] == 1st key, id is matched and passed response is contextual to items, so,
        // start building the response object 
        let result = {
            route: {
                path: pck.data.slice(0, ptr - 9),
                segsize: TS.read('uint16', pck.data, ptr - 4, true)
            },
            data: {}
        }
        // read response,
        if (pck.data[ptr] == EP.ERR.KEY) { // check halting errors: querydown or unclear query
            if (pck.data[ptr + 1] == EP.ERR.KEYS.QUERYDOWN) {
                tracked.reject('querydown')
                return
            } else if (pck.data[ptr + 1] == EP.ERR.KEYS.UNCLEAR) {
                tracked.reject('unclear')
                return
            }
        } // end clear errs 
        let rr = {}
        // 1st terms not errors, deserialize
        let items = tracked.items
        itemloop: for (let i = 0; i < items.length; i++) {
            if (ptr >= pck.data.length) break;
            // check for null / noread,
            if (pck.data[ptr] == EP.ERR.KEY) {
                if (pck.data[ptr + 1] == EP.ERR.KEYS.EMPTY) {
                    result.data[items[i]] = null
                    ptr += 2 // increment read pointer
                } else if (pck.data[ptr + 1] == EP.ERR.KEYS.NOREAD) {
                    result.data[items[i]] = null
                    ptr += 2
                }
            } else if (pck.data[ptr] != EP[items[i].toUpperCase()].KEY) {
                console.warn('out of place key during response deserialization')
                console.warn('have', pck.data[ptr])
                console.warn('expected', EP[items[i].toUpperCase()].KEY)
                console.warn('packet')
                TS.logPacket(pck.data)
                break; // this is terminal to reading,
            } else {
                // pck.data[rptr] = the item key, so we can read it in,
                if (EP[items[i].toUpperCase()].ISDIVE) {
                    // great, we successfully downselected,
                    // assuming all queries go down tree before specifying actual endpoints,
                    // though that's not baked into any code...
                    // and that we are returning an object in place... i.e. response object is contextual to query items
                    ptr += 3 // past key and two indices, will ignore,
                    i += 1
                } else {
                    // the actual endpoint items, 
                    switch (items[i]) {
                        // ------------------------------------------ COUNTS
                        case "numVPorts":
                            result.data.numVPorts = TS.read('uint16', pck.data, ptr + 1, true)
                            ptr += 3
                            break;
                        case "numVModules":
                            result.data.numVModules = TS.read('uint16', pck.data, ptr + 1, true)
                            ptr += 3
                            break;
                        case "numInputs":
                            result.data.numInputs = TS.read('uint16', pck.data, ptr + 1, true)
                            ptr += 3
                            break;
                        case "numOutputs":
                            result.data.numOutputs = TS.read('uint16', pck.data, ptr + 1, true)
                            ptr += 3
                            break;
                        case "numRoutes":
                            result.data.numOutputs = TS.read('uint16', pck.data, ptr + 1, true)
                            ptr += 3
                            break;
                        // ------------------------------------------ DATA ENDPOINTS
                        case "name":
                            rr = TS.read('string', pck.data, ptr + 1, true)
                            result.data.name = rr.value
                            ptr += rr.inc + 1
                            break;
                        case "description":
                            rr = TS.read('string', pck.data, ptr + 1, true)
                            result.data.description = rr.value
                            ptr += rr.inc + 1
                            break;
                        case "portTypeKey":
                            result.data.portTypeKey = pck.data[ptr + 1]
                            ptr += 2
                            break;
                        case "maxSegLength":
                            result.data.maxSegLength = TS.read('uint32', pck.data, ptr + 1, true)
                            ptr += 5
                            break;
                        case "maxAddresses":
                            result.data.maxAddresses = TS.read('uint16', pck.data, ptr + 1, true)
                            ptr += 3
                            break;
                        case "portStatus":
                            if (pck.data[ptr + 1]) {
                                result.data.portStatus = true
                            } else {
                                result.data.portStatus = false
                            }
                            ptr += 2
                            break;
                        // TODO need type, value, status, numroutes, route
                        default:
                            console.warn('nonrecognized key during read response deserialization')
                            break itemloop;
                    } // end switch
                } // end case where item != dive,
            } // end case where pck.data[ptr] = item.key
        } // end loop over items
        tracked.response(result) // return the deserialized items 
    }

    // ------------------------------------------------------ WRITE / RESPOND NODE INFORMATION 
    // so, route ...items, a list of endpoints *with* value arguments 
    // whereas the query has structures like route / tree down-selection / ...individual endpoints 
    // this has similar, route / tree down-selection / ...indidivual (endpoint, writevalue)(pairs!)
    osap.write = (route, ...items) => {
        return new Promise((resolve, reject) => {
            // we are an outgoing write request,
            let req = [DK.WREQ, nextMvcID & 255, (nextMvcID >> 8) & 255]
            // items -> uppercase,
            // write out a packet of endpoint keys for each item
            // if ever find an error, we terminate the list
            for (let i = 0; i < items.length; i++) {
                if (EP[items[i].toUpperCase()]) {
                    if (EP[items[i].toUpperCase()].ISDIVE) {
                        // tree depth jump, provide indice
                        if (typeof items[i + 1] != 'number') {
                            reject('requested indice-selecting information, did not provide indice, check query arguments')
                            return
                        } else {
                            req.push(EP[items[i].toUpperCase()].KEY, items[i + 1] & 255, (items[i + 1] >> 8) & 255)
                            i++
                        }
                    } else {
                        // same level, key and new-value, 
                        // want to check for OK value - set to this endpoint, 
                        // TODO - really, should do this with whatever 'typeset' is going to be, 
                        // to check values and serialize them - at the moment, just interested in writing an uint16, then boolean, 
                        // and we know this, so, lettuce continue 
                        if (typeof items[i + 1] != 'number' || typeof items[i + 2] != 'boolean') {
                            reject('write-req only possible now for ports: args are <rxAddr> and <on/off> true/false')
                            return
                        } else {
                            req.push(EP[items[i].toUpperCase()].KEY, items[i + 1] & 255, (items[i + 1] >> 8) & 255)
                            if (items[i + 2]) { // adhoc boolean write 
                                req.push(1)
                            } else {
                                req.push(0)
                            }
                            i += 2
                        }
                    }
                } else {
                    reject('unrecognized key requested in call to query, check arguments')
                    return
                }
            } // finish loop over items 
            // packetize and ship it 
            req = Uint8Array.from(req)
            // transmission 
            let rejected = false
            osap.send(route, req).then(() => {
                mvcReqs.push({
                    id: nextMvcID,
                    items: items,
                    response: (res) => {
                        if (!rejected) resolve(res)
                    },
                    reject: (msg) => {
                        if (!rejected) reject(msg)
                    }
                })
                // increment req id 
                incrementMvcID()
                setTimeout(() => {
                    rejected = true
                    reject(`write request timeout to ${route.path}`)
                }, TIMEOUT)
            }).catch((err) => {
                console.error(err)
                reject(`write request tx error`)
            })
        })
    }

    // ------------------------------------------------------ HANDLE INCOMING WRITE REQUESTS 
    // pck.data[ptr] = DK.WREQ
    osap.handleWriteRequest = (pck, rptr) => {
        if (LOGRX) console.log("HANDLE WRITE REQ")
        // if the response path isn't clear, we leave this in buffer for next turn 
        if (!pck.vp.cts()) {
            if (!pck.vp.status() != EP.PORTSTATUS.OPEN) {
                if (LOGERRPOPS) console.log('popping write request - port to respond on is doa')
                pck.vp.clear()
            }
            return
        }
        // ready to resp, we can prep reverse route: want to know allowable return size 
        pck.vp.clear() // we *will* respond in this turn now, so, clear to rm 
        let route = osap.reverseRoute(pck)
        // big uint, will truncate at fin, 
        let reply = new Uint8Array(8192)
        reply[0] = DK.WRES
        reply[1] = pck.data[rptr + 1] // copy mvcID, direct 
        reply[2] = pck.data[rptr + 2]
        // now the key walk, 
        rptr += 3 // read-ptr now at first key, 
        let wptr = 3 // write-ptr at end of current reply, 
        let obj = osap // at head, logical object being addressed is the osap node (us)
        let indice = null // placeholder, 
        // walk ptrs, up to 32 queries in 1 request 
        keywalk: for (let i = 0; i < 32; i++) {
            // don't write responses longer 
            if (wptr + route.path.length + 3 > route.segsize) {
                console.log("QUERY DOWN")
                reply[3] = EP.ERR.KEY
                reply[4] = EP.ERR.KEYS.QUERYDOWN
                wptr = 5
                break keywalk;
            }
            // if we've read past the end of the request, we're done 
            if (rptr >= pck.data.length) {
                if (LOGRX) console.log("WRITE REQ COMPLETE")
                break keywalk;
            }
            // to write in null-returns 
            let writeEmpty = () => {
                reply[wptr++] = EP.ERR.KEY
                reply[wptr++] = EP.ERR.KEYS.EMPTY
            }
            // ok, walk 'em 
            switch (pck.data[rptr]) {
                // ---------------------------------------------------------- DIVES
                // first up, handle dives, which select down- the tree
                // ATM: only support to write to port statuses, for remotes to try to re-open i.e. serialport 
                case EP.VPORT.KEY:
                    indice = TS.read('uint16', pck.data, rptr + 1, true)
                    if (osap.vPorts[indice] && obj == osap) { // only if it exists, and only exists at node level
                        obj = osap.vPorts[indice] // select this for next queries,
                        reply[wptr++] = EP.VPORT.KEY // identify that the response's next items are for this item,
                        reply[wptr++] = pck.data[rptr + 1]
                        reply[wptr++] = pck.data[rptr + 2]
                        rptr += 3
                    } else {
                        writeNull() // that vport doesn't exist 
                        break keywalk; // this is terminal for the key walk: succeeding arguments are now null
                    }
                    break;
                // ------------------------------------------------ PORT SPECIFIC
                case EP.PORTSTATUS.KEY:
                    if (obj.portTypeKey) {
                        let rxAddr = TS.read('uint16', pck.data, rptr + 1, true)
                        if (pck.data[rptr + 3] > 0) {
                            // try open, unless open 
                            if (obj.status(rxAddr) != EP.PORTSTATUS.OPEN) {
                                console.log('req open', obj.name)
                                obj.requestOpen() // but don't wait: open requests take time, system will poll 
                            }
                        } else {
                            // set closed, 
                            obj.requestClose()
                        }
                        // writing is actually the same as a read request 
                        reply[wptr++] = EP.PORTSTATUS.KEY
                        reply[wptr++] = obj.status(rxAddr)
                        rptr += 4
                    } else {
                        writeEmpty()
                        rptr += 2
                    }
                    break;
                // ------------------------------------------------ DEFAULT 
                default:
                    console.log("WRITE REQ: NONRECOGNIZED KEY", pck.data[rptr], 'at rptr', rptr)
                    TS.logPacket(pck.data)
                    reply[3] = EP.ERR.KEY
                    reply[4] = EP.ERR.KEYS.UNCLEAR
                    wptr = 5
                    break keywalk;
            } // end switch 
        } // end of keywalk 
        reply = Uint8Array.from(reply.subarray(0, wptr))
        osap.send(route, reply).then(() => {
            // success, 
        }).catch((err) => {
            console.error(err)
            console.log(`write response tx error`)
        })
    }

    // ------------------------------------------------------ HANDLE WRITE RESPONSES
    // pck.data[ptr] = DK.WRES 
    osap.handleWriteResponse = (pck, ptr) => {
        // all responses should have IDs trailing the D-key, should be associated w/ one we're tracking 
        let id = TS.read('uint16', pck.data, ptr + 1, true)
        let tracked = mvcReqs.find((cand) => { return cand.id == id })
        ptr += 3
        pck.vp.clear() // errs or not, clear it 
        if (!tracked) {
            if (LOGERRPOPS) console.error('response to untracked request, popping')
            return
        }
        // pck.data[ptr] == 1st key, id is matched and passed 
        // response is contextual to items in the request, 
        let result = {
            route: {
                path: pck.data.slice(0, ptr - 9),
                segsize: TS.read('uint16', pck.data, ptr - 4, true)
            },
            data: {}
        }
        // read the response, 
        if (pck.data[ptr] == EP.ERR.KEY) {
            if (pck.data[ptr + 1] == EP.ERR.KEYS.QUERYDOWN) {
                tracked.reject("querydown")
                return
            } else if (pck.data[ptr + 1] == EP.ERR.KEYS.UNCLEAR) {
                tracked.reject('unclear')
                return
            }
        } // end clear errs 
        // deserialize 
        let rr = {}
        let items = tracked.items
        itemloop: for (let i = 0; i < items.length; i++) {
            if (ptr > pck.data.length) break
            // check for null / nowrite 
            if (pck.data[ptr] == EP.ERR.KEY) {
                if (pck.data[ptr + 1] == EP.ERR.KEYS.EMPTY) {
                    result.data[items[i]] = null
                    ptr += 2 // increment read pointer
                } else if (pck.data[ptr + 1] == EP.ERR.KEYS.NOWRITE) {
                    result.data[items[i]] = null
                    ptr += 2
                }
            } else if (pck.data[ptr] != EP[items[i].toUpperCase()].KEY) {
                console.warn('out of place key during response deserialization')
                console.warn('have', pck.data[ptr])
                console.warn('expected', EP[items[i].toUpperCase()].KEY)
                break // this is terminal to reading,
            } else {
                // pck.data[rptr] = the item key, so we can read this, 
                if (EP[items[i].toUpperCase()].ISDIVE) {
                    // successfully downselected, so 
                    ptr += 3 // past key and two indices (16 bit) 
                    i += 1
                } else {
                    // actual endpoint items, 
                    switch (items[i]) {
                        case "portStatus":
                            result.data.portStatus = pck.data[ptr + 1]
                            ptr += 3
                            i += 1
                            break;
                        default:
                            console.warn('WHAT KEY')
                            break itemloop; // terminal error 
                    } // end endpoint switch 
                } // end case for item != dive 
            } // end case where pck.data[ptr] = item.key 
        }// end loop over items 
        tracked.response(result) // return the deserialized response 
    }
}