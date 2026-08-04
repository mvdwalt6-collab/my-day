! function(n, e) {
    "undefined" != typeof module && module.exports ? module.exports = e() : n.Core = e()
}("undefined" != typeof self ? self : this, function() {
    "use strict";
    var n = "myday.v1",
        e = {
            Morning: [5, 12],
            Afternoon: [12, 17],
            Evening: [17, 20.5],
            Bonus: [5, 24]
        },
        t = null,
        a = null;

    function i(n) {
        return (n < 10 ? "0" : "") + n
    }

    function r(n) {
        return a._seq = (a._seq || 0) + 1, (n || "id") + "_" + a._seq
    }

    function o(n) {
        var e = new Date(n);
        return e.getHours() < 4 && e.setDate(e.getDate() - 1), e
    }

    function u(n) {
        var e = o(n);
        return e.getFullYear() + "-" + i(e.getMonth() + 1) + "-" + i(e.getDate())
    }

    function s(n) {
        return (o(n).getDay() + 6) % 7
    }

    function c(n) {
        var e = new Date(n);
        return e.getHours() + e.getMinutes() / 60
    }
    var d = [
        ["☀️", "Wake up", "Word wakker", "Morning", null, 2, !0, !0, 0, "none"],
        ["🥣", "Breakfast", "Ontbyt", "Morning", null, 3, !0, !1, 0, "none"],
        ["👕", "Get dressed", "Trek aan", "Morning", null, 3, !0, !1, 0, "next"],
        ["🪥", "Brush teeth", "Borsel tande", "Morning", null, 2, !0, !0, 0, "none"],
        ["🪮", "Brush hair", "Kam hare", "Morning", null, 2, !1, !1, 0, "none"],
        ["⚽", "Sport", "Sport", "Afternoon", "16:00", 5, !0, !1, 0, "none"],
        ["🧸", "Play", "Speel", "Afternoon", null, 2, !1, !1, 0, "later"],
        ["🍽️", "Dinner", "Aandete", "Evening", null, 3, !0, !1, 0, "none"],
        ["🧹", "Chores", "Takies", "Evening", null, 4, !0, !1, 2, "next"],
        ["🛁", "Bath", "Bad", "Evening", null, 2, !0, !1, 0, "none"],
        ["🌙", "Sleep", "Slaap", "Evening", null, 2, !0, !0, 0, "none"],
        ["🎒", "Leave for school", "Ry skool toe", "Morning", "07:20", 3, !0, !1, 0, "none"],
        ["🎾", "Leave for tennis", "Ry tennis toe", "Afternoon", "15:45", 4, !0, !1, 0, "none"],
        ["🛏️", "Make your bed", "Maak jou bed", "Bonus", null, 10, !1, !1, 0, "none"],
        ["📚", "Tidy toys", "Pak speelgoed weg", "Bonus", null, 8, !1, !1, 0, "none"]
    ];

    function l() {
        a = {
            _seq: 0,
            pin: "1234",
            kidLang: "af",
            settings: {
                dayStart: 4,
                weeklySummary: !0,
                holdMs: 650,
                alarmLeadMin: 5,
                alarmRingSec: 60,
                snoozeMin: 5,
                screenTimeStart: "18:00",
                screenTimeEnd: "19:00",
                weatherEnabled: !0
            },
            children: [],
            tasks: [],
            goals: [],
            completions: [],
            ledger: [],
            applied: {},
            snoozes: {},
            screenTime: {}
        };
        a
    }

    function f() {
        try {
            t.set(n, JSON.stringify(a))
        } catch (n) {}
    }

    function h(n) {
        return a.children.filter(function(e) {
            return e.id === n
        })[0]
    }

    function p(n) {
        return a.tasks.filter(function(e) {
            return e.id === n
        })[0]
    }

    function m(n, e, t) {
        return a.completions.some(function(a) {
            return a.childId === n && a.taskId === e && a.date === t && "done" === a.status
        })
    }

    function g(n, t) {
        if (!n.active) return "inactive";
        var a = s(t);
        if (n.days.indexOf(a) < 0) return "inactive";
        var i = u(t);
        if (m(n.childId, n.id, i)) return "done";
        var r = e[n.win] || e.Morning,
            o = n.time ? function(n) {
                if (!n) return null;
                var e = String(n).split(":");
                return parseInt(e[0], 10) + parseInt(e[1] || "0", 10) / 60
            }(n.time) : r[0],
            d = r[1],
            l = c(t);
        return l < o ? "locked" : l >= d ? "missed" : "available"
    }

    function v(n, e, t, i, o) {
        h(n).balance += e, a.ledger.push({
            id: r("l"),
            childId: n,
            ts: o || Date.now(),
            type: t,
            amount: e,
            note: i || ""
        })
    }

    function k(n, e) {
        var t = a.goals.filter(function(e) {
            return e.id === n
        })[0];
        t && (Object.keys(e).forEach(function(n) {
            t[n] = e[n]
        }), f())
    }

    function y(n) {
        var e = h(n);
        return e ? e.balance : 0
    }
    var I = [
        ["#ff9f5c", "#ffe4cc"],
        ["#ff7fb0", "#ffd9e8"],
        ["#34c08a", "#cdeede"],
        ["#8a7ff0", "#e6e2fb"],
        ["#5aa9e6", "#d6ecfb"],
        ["#e6b800", "#fff0bf"]
    ];

    function D(n, e) {
        var t = new Date(n),
            a = t.getFullYear() + "-" + i(t.getMonth() + 1) + "-" + i(t.getDate());
        return e.indexOf(a) >= 0
    }
    return {
        KEY: n,
        WIN: e,
        init: function(e, i) {
            t = e;
            var r = null;
            try {
                r = t.get(n)
            } catch (n) {
                r = null
            }
            if (r) try {
                a = JSON.parse(r)
            } catch (n) {
                a = null
            }
            return a || (l(), f()), a.applied || (a.applied = {}), a.snoozes || (a.snoozes = {}), a
        },
        save: f,
        getState: function() {
            return a
        },
        reset: function() {
            return l(), f(), a
        },
        seed: l,
        child: h,
        task: p,
        dateKey: u,
        dow: s,
        nowHour: c,
        logicalDateObj: o,
        taskState: g,
        tasksForChildToday: function(n, e) {
            return a.tasks.filter(function(e) {
                return e.childId === n
            }).map(function(n) {
                return {
                    task: n,
                    state: g(n, e)
                }
            }).filter(function(n) {
                return "inactive" !== n.state
            })
        },
        nextAlarm: function(n, e) {
            var t = 60 * (a.settings.alarmLeadMin || 5),
                i = a.settings.alarmRingSec || 60,
                r = a.settings.alarmVisibleSec || 300,
                o = new Date(e).getTime(),
                c = new Date(e),
                d = s(e),
                l = u(e),
                f = null;
            if (a.tasks.forEach(function(e) {
                    if (e.childId === n && e.active && e.alarm && !e.mute && e.time && !(e.days.indexOf(d) < 0 || m(n, e.id, l))) {
                        var t = String(e.time).split(":"),
                            i = new Date(c.getFullYear(), c.getMonth(), c.getDate(), parseInt(t[0], 10), parseInt(t[1] || "0", 10), 0, 0).getTime(),
                            u = a.snoozes[e.id + ":" + l],
                            s = u && u > i ? u : i,
                            h = (s - o) / 1e3;
                        h < -r || (!f || h < f.secs) && (f = {
                            task: e,
                            at: s,
                            secs: h
                        })
                    }
                }), !f) return null;
            var h = f.secs;
            return f.phase = h > t ? "idle" : h > 0 ? "soon" : h >= -i ? "ring" : "due", f.secsToGo = Math.max(0, Math.round(h)), f.snoozeMin = a.settings.snoozeMin || 5, f.snoozed = !!a.snoozes[f.task.id + ":" + l], f
        },
        complete: function(n, e, t) {
            var i = p(e);
            if (!i) return {
                ok: !1,
                reason: "no-task"
            };
            var o = g(i, t);
            return "available" !== o ? {
                ok: !1,
                reason: o
            } : (a.completions.push({
                id: r("cp"),
                childId: n,
                taskId: e,
                date: u(t),
                ts: new Date(t).getTime(),
                amount: i.amount,
                status: "done",
                manual: !1
            }), v(n, i.amount, "Bonus" === i.win ? "bonus" : "earn", i.en, new Date(t).getTime()), f(), {
                ok: !0,
                coins: i.amount
            })
        },
        undo: function(n) {
            var e = a.completions.findIndex(function(e) {
                return e.id === n
            });
            if (e < 0) return {
                ok: !1
            };
            var t = a.completions[e];
            return "done" === t.status && v(t.childId, -t.amount, "undo", "Undo", Date.now()), a.completions.splice(e, 1), f(), {
                ok: !0
            }
        },
        dispute: function(n, e) {
            var t = a.completions.filter(function(e) {
                return e.id === n
            })[0];
            return t && "done" === t.status ? null != e && t.date !== u(e) ? {
                ok: !1,
                reason: "locked"
            } : (t.status = "disputed", v(t.childId, -t.amount, "dispute", "Disputed", Date.now()), f(), {
                ok: !0
            }) : {
                ok: !1,
                reason: "missing"
            }
        },
        disputable: function(n, e) {
            var t = a.completions.filter(function(e) {
                return e.id === n
            })[0];
            return !!t && "done" === t.status && t.date === u(e)
        },
        creditMissed: function(n, e, t) {
            var i = p(e);
            if (!i) return {
                ok: !1
            };
            var o = u(t);
            return m(n, e, o) ? {
                ok: !1,
                reason: "already"
            } : (a.completions.push({
                id: r("cp"),
                childId: n,
                taskId: e,
                date: o,
                ts: Date.now(),
                amount: i.amount,
                status: "done",
                manual: !0
            }), v(n, i.amount, "earn", i.en + " (given)", Date.now()), f(), {
                ok: !0,
                coins: i.amount
            })
        },
        reconcile: function(n) {
            var t = u(n),
                i = s(n),
                r = c(n),
                o = 0;
            return a.tasks.forEach(function(n) {
                if (n.active && n.penalty && !(n.days.indexOf(i) < 0)) {
                    var u = (e[n.win] || e.Morning)[1];
                    if (!(r < u || m(n.childId, n.id, t))) {
                        var s = "pen:" + n.id + ":" + t;
                        a.applied[s] || (v(n.childId, -n.penalty, "penalty", "Skipped: " + n.en, Date.now()), a.applied[s] = !0, o++)
                    }
                }
            }), o && f(), o
        },
        snooze: function(n, e, t) {
            var i = a.settings.snoozeMin || 5;
            return a.snoozes[e + ":" + u(t)] = new Date(t).getTime() + 6e4 * i, f(), {
                ok: !0,
                mins: i
            }
        },
        setPin: function(n) {
            return 4 !== (n = String(null == n ? "" : n).replace(/\D/g, "").slice(0, 4)).length ? {
                ok: !1,
                reason: "need-4-digits"
            } : (a.pin = n, f(), {
                ok: !0
            })
        },
        goalsFor: function(n, e) {
            return a.goals.filter(function(t) {
                return t.childId === n && (!e || t.status === e)
            })
        },
        addGoal: function(n, e) {
            a.goals.push({
                id: r("g"),
                childId: n,
                icon: e.icon || "🎁",
                name: e.name || "Goal",
                price: +e.price || 0,
                status: e.status || "active",
                repeatableDaily: !!e.repeatableDaily
            }), f()
        },
        updateGoal: k,
        setGoalStatus: function(n, e) {
            k(n, {
                status: e
            })
        },
        deleteGoal: function(n) {
            a.goals = a.goals.filter(function(e) {
                return e.id !== n
            }), f()
        },
        isGoalRedeemedToday: function(n, e, t) {
            return !!a.applied["goal:" + e + ":" + u(t)]
        },
        spend: function(n, e, t) {
            v(n, -Math.abs(e), "spend", t || "Spent"), f()
        },
        redeemGoal: function(n, e, t) {
            var i = a.goals.filter(function(t) {
                return t.id === e
            })[0];
            if (!i) return {
                ok: !1,
                reason: "no-goal"
            };
            var o = "goal:" + e + ":" + u(t);
            if (a.applied[o] && !i.repeatableDaily) return {
                ok: !1,
                reason: "already-redeemed"
            };
            var s = a.children.filter(function(e) {
                return e.id === n
            })[0];
            return s && s.balance >= i.price ? (v(n, -i.price, "spend", "Redeemed: " + i.name, Date.now()), a.applied[o] = !0, f(), {
                ok: !0,
                coins: i.price
            }) : {
                ok: !1,
                reason: "insufficient-balance"
            }
        },
        advance: function(n, e, t) {
            v(n, Math.abs(e), "advance", t || "Advance"), f()
        },
        adjust: function(n, e, t) {
            v(n, e, "adjust", t || "Adjustment"), f()
        },
        balance: y,
        kidBalance: function(n) {
            return Math.max(0, y(n))
        },
        addTask: function(n, e) {
            var t = {
                id: r("t"),
                childId: n,
                icon: e.icon || "🙂",
                en: e.en || "",
                af: e.af || "",
                win: e.win || "Morning",
                time: e.time || null,
                amount: +e.amount || 0,
                alarm: !!e.alarm,
                mute: !!e.mute,
                penalty: +e.penalty || 0,
                carry: e.carry || "none",
                days: e.days || [0, 1, 2, 3, 4, 5, 6],
                active: !1 !== e.active
            };
            return a.tasks.push(t), f(), t
        },
        updateTask: function(n, e) {
            var t = p(n);
            return t && (Object.keys(e).forEach(function(n) {
                t[n] = e[n]
            }), f()), t
        },
        removeTask: function(n) {
            a.tasks = a.tasks.filter(function(e) {
                return e.id !== n
            }), f()
        },
        copyDay: function(n, e, t) {
            t.forEach(function(t) {
                a.tasks.filter(function(e) {
                    return e.childId === n
                }).forEach(function(n) {
                    var a = n.days.indexOf(e) >= 0,
                        i = n.days.indexOf(t);
                    a && i < 0 && n.days.push(t), !a && i >= 0 && n.days.splice(i, 1)
                })
            }), f()
        },
        cloneWeek: function(n, e) {
            a.tasks = a.tasks.filter(function(n) {
                return n.childId !== e
            }), a.tasks.filter(function(e) {
                return e.childId === n
            }).forEach(function(n) {
                var t, i = (t = n, JSON.parse(JSON.stringify(t)));
                i.id = r("t"), i.childId = e, a.tasks.push(i)
            }), f()
        },
        addChild: function(n) {
            var e = I[a.children.length % I.length],
                t = r("c");
            return a.children.push({
                id: t,
                name: n.name || "Child",
                av: n.av || "🙂",
                color: n.color || e[0],
                colorLite: n.colorLite || e[1],
                balance: 0
            }), f(), t
        },
        updateChild: function(n, e) {
            var t = h(n);
            t && (Object.keys(e).forEach(function(n) {
                t[n] = e[n]
            }), f())
        },
        removeChild: function(n) {
            a.children = a.children.filter(function(e) {
                return e.id !== n
            }), a.tasks = a.tasks.filter(function(e) {
                return e.childId !== n
            }), a.goals = a.goals.filter(function(e) {
                return e.childId !== n
            }), f()
        },
        earnedToday: function(n, e) {
            var t = u(e);
            return a.completions.filter(function(e) {
                return e.childId === n && e.date === t && "done" === e.status
            }).reduce(function(n, e) {
                return n + e.amount
            }, 0)
        },
        possibleToday: function(n, e) {
            var t = s(e);
            return a.tasks.filter(function(e) {
                return e.childId === n && e.active && "Bonus" !== e.win && e.days.indexOf(t) >= 0
            }).reduce(function(n, e) {
                return n + e.amount
            }, 0)
        },
        weeklySummary: function(n, e) {
            for (var t = [], r = o(e), u = 0; u < 7; u++) {
                var s = new Date(r);
                s.setDate(s.getDate() - u), t.push(s.getFullYear() + "-" + i(s.getMonth() + 1) + "-" + i(s.getDate()))
            }
            var c = a.completions.filter(function(e) {
                    return e.childId === n && "done" === e.status && t.indexOf(e.date) >= 0
                }).length,
                d = a.ledger.filter(function(e) {
                    return e.childId === n && ("earn" === e.type || "bonus" === e.type) && D(e.ts, t)
                }).reduce(function(n, e) {
                    return n + e.amount
                }, 0),
                l = a.ledger.filter(function(e) {
                    return e.childId === n && "spend" === e.type && D(e.ts, t)
                }).reduce(function(n, e) {
                    return n + Math.abs(e.amount)
                }, 0),
                f = 0;
            t.forEach(function(e) {
                var t = (new Date(e + "T12:00:00").getDay() + 6) % 7;
                f += a.tasks.filter(function(e) {
                    return e.childId === n && e.active && "Bonus" !== e.win && e.days.indexOf(t) >= 0
                }).length
            });
            var h = Math.max(0, f - c);
            return {
                done: c,
                scheduled: f,
                missed: h,
                earned: d,
                spent: l
            }
        },
        pendingToday: function(n, e) {
            var t = u(e);
            return a.completions.filter(function(e) {
                return e.childId === n && e.date === t && "done" === e.status
            }).map(function(n) {
                return {
                    completion: n,
                    task: p(n.taskId)
                }
            })
        }
    }
});