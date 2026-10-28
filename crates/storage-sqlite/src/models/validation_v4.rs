//! V4 keeps scene data bounded and adds independent, resettable part graphs.
use super::{invalid, label, table, validate_graph};
use discatelier_contracts::AppError;
use serde_json::Value;
use std::collections::{HashMap, HashSet};

pub(super) fn validate(value: &Value, nodes: &HashMap<&str, &Value>) -> Result<(), AppError> {
    let controllers = table(&value["controllers"], 8)?;
    if controllers.is_empty() {
        return Err(invalid("V4 缺少独立控制器。"));
    }
    let global_states = table(&value["states"], 768)?;
    let mut owned = HashSet::new();
    let mut state_count = global_states.len();
    let mut action_count = table(&value["actions"], 4000)?.len();
    for control in controllers.values() {
        let part = label(&control["part"], 160)?;
        if !nodes.contains_key(part)
            || control["navigation"]["stateReset"] != true
            || !control["controllers"].is_null()
        {
            return Err(invalid("独立控制器部件或收起配置无效。"));
        }
        let enabled = control["enabledIn"]
            .as_array()
            .ok_or_else(|| invalid("控制器启用状态无效。"))?;
        let mut seen_enabled = HashSet::new();
        if enabled.is_empty() || enabled.len() > global_states.len() {
            return Err(invalid("控制器启用状态数量无效。"));
        }
        for state in enabled {
            let id = label(state, 160)?;
            if !global_states.contains_key(id)
                || state == &value["initialState"]
                || !seen_enabled.insert(id)
            {
                return Err(invalid("控制器启用状态不存在或重复。"));
            }
        }
        let mut subtree = HashMap::new();
        for (&id, &node) in nodes {
            let mut current = Some(node);
            while let Some(n) = current {
                if n["id"] == part {
                    if !owned.insert(id) {
                        return Err(invalid("控制器部件重叠。"));
                    }
                    subtree.insert(id, node);
                    break;
                }
                current = n["parent"].as_str().and_then(|p| nodes.get(p).copied());
            }
        }
        validate_graph(control, &subtree, 2048, 10000)?;
        let states = table(&control["states"], 2048)?;
        let actions = table(&control["actions"], 10000)?;
        state_count += states.len();
        action_count += actions.len();
        if state_count > 8192 || action_count > 24000 {
            return Err(invalid("独立交互总数量过大。"));
        }
        for action in actions.values() {
            if action["part"] != part {
                return Err(invalid("独立动作所属部件无效。"));
            }
        }
        let initial = label(&control["initialState"], 160)?;
        for state in states.values() {
            let mut current = *state;
            let mut visited = HashSet::new();
            while current["id"] != initial {
                let id = label(&current["id"], 160)?;
                if !visited.insert(id) {
                    return Err(invalid("独立部件收起路径循环。"));
                }
                let reset = &current["reset"];
                let action = actions
                    .get(label(&reset["action"], 160)?)
                    .ok_or_else(|| invalid("独立收起动作不存在。"))?;
                let reverse = reset["reverse"].as_bool().unwrap_or(false);
                let (from, to) = if reverse {
                    ("to", "from")
                } else {
                    ("from", "to")
                };
                if action[from] != id {
                    return Err(invalid("独立收起动作不连续。"));
                }
                current = states
                    .get(label(&action[to], 160)?)
                    .ok_or_else(|| invalid("独立收起状态不存在。"))?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture() -> Value {
        json!({
            "initialState":"stored",
            "states":[{"id":"stored"},{"id":"out"}],
            "actions":[],
            "controllers":[{
                "id":"reading","part":"book","enabledIn":["out"],
                "initialState":"closed","navigation":{"stateReset":true},
                "states":[
                    {"id":"closed","focus":[],"clicks":[{"target":"page","action":"open"}]},
                    {"id":"open","focus":[],"clicks":[{"target":"page","action":"close"}],"reset":{"action":"close"}}
                ],
                "actions":[
                    {"id":"open","from":"closed","to":"open","part":"book","duration":500},
                    {"id":"close","from":"open","to":"closed","part":"book","duration":500}
                ]
            }]
        })
    }

    #[test]
    fn independent_graph_requires_local_ownership_and_a_complete_return_path() {
        let book = json!({"id":"book","parent":null});
        let page = json!({"id":"page","parent":"book"});
        let nodes = HashMap::from([("book", &book), ("page", &page)]);
        assert!(validate(&fixture(), &nodes).is_ok());
        let mut bad = fixture();
        bad["controllers"][0]["states"][1]["reset"]["action"] = json!("open");
        assert!(validate(&bad, &nodes).is_err());
        let mut bad = fixture();
        bad["controllers"][0]["enabledIn"] = json!(["stored"]);
        assert!(validate(&bad, &nodes).is_err());
        let mut bad = fixture();
        bad["controllers"][0]["actions"][0]["part"] = json!("page");
        assert!(validate(&bad, &nodes).is_err());
    }
}
