use crate::error::SevenError;
use serde::Serialize;
use serde_json::Value;
use std::{path::{Path, PathBuf}, process::{Command, Stdio}};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IsoValidationFailure {
    pub specification: String,
    pub clause: String,
    pub test_number: String,
    pub description: String,
    pub object: String,
    pub failed_checks: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IsoValidationReport {
    pub profile_name: String,
    pub statement: String,
    pub compliant: bool,
    pub passed_rules: usize,
    pub failed_rules: usize,
    pub passed_checks: usize,
    pub failed_checks: usize,
    pub failures: Vec<IsoValidationFailure>,
}

fn string_value(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(value)) => value.clone(),
        Some(Value::Number(value)) => value.to_string(),
        Some(Value::Bool(value)) => value.to_string(),
        _ => String::new(),
    }
}

fn usize_value(value: Option<&Value>) -> usize {
    match value {
        Some(Value::Number(value)) => value.as_u64().unwrap_or_default() as usize,
        Some(Value::String(value)) => value.parse().unwrap_or_default(),
        _ => 0,
    }
}

fn bool_value(value: Option<&Value>) -> Option<bool> {
    match value {
        Some(Value::Bool(value)) => Some(*value),
        Some(Value::String(value)) => match value.to_ascii_lowercase().as_str() {
            "true" => Some(true),
            "false" => Some(false),
            _ => None,
        },
        _ => None,
    }
}

fn find_validation_report<'a>(value: &'a Value) -> Option<&'a serde_json::Map<String, Value>> {
    match value {
        Value::Object(map) => {
            if map.contains_key("isCompliant") && map.contains_key("profileName") {
                return Some(map);
            }
            for child in map.values() {
                if let Some(found) = find_validation_report(child) {
                    return Some(found);
                }
            }
            None
        }
        Value::Array(values) => values.iter().find_map(find_validation_report),
        _ => None,
    }
}

fn collect_failures(value: &Value, output: &mut Vec<IsoValidationFailure>) {
    match value {
        Value::Object(map) => {
            let status = string_value(map.get("status"));
            let failed_checks = usize_value(map.get("failedChecks"));
            let description = string_value(map.get("description"));
            if (status.eq_ignore_ascii_case("failed") || failed_checks > 0)
                && !description.is_empty()
                && (map.contains_key("clause") || map.contains_key("specification"))
            {
                output.push(IsoValidationFailure {
                    specification: string_value(map.get("specification")),
                    clause: string_value(map.get("clause")),
                    test_number: string_value(map.get("testNumber")),
                    description,
                    object: string_value(map.get("object")),
                    failed_checks,
                });
            }
            for child in map.values() {
                collect_failures(child, output);
            }
        }
        Value::Array(values) => {
            for child in values {
                collect_failures(child, output);
            }
        }
        _ => {}
    }
}

fn validate_flavour(flavour: &str) -> Result<(), SevenError> {
    if matches!(
        flavour,
        "0" | "1a" | "1b" | "2a" | "2b" | "2u" | "3a" | "3b" | "3u"
            | "4" | "4e" | "4f" | "ua1" | "ua2" | "wt1r" | "wt1a"
    ) {
        Ok(())
    } else {
        Err(SevenError::OperationRejected("Perfil veraPDF não suportado".into()))
    }
}

pub fn validate(
    executable: &Path,
    input: &Path,
    flavour: &str,
    custom_profile: Option<PathBuf>,
) -> Result<IsoValidationReport, SevenError> {
    validate_flavour(flavour)?;

    let mut command = Command::new(executable);
    command
        .arg("--format")
        .arg("json")
        .arg("--maxfailuresdisplayed")
        .arg("50")
        .arg("--loglevel")
        .arg("0");

    if let Some(profile) = custom_profile {
        if !profile.is_file() {
            return Err(SevenError::NotFound(profile.to_string_lossy().into_owned()));
        }
        let extension = profile
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if extension != "xml" {
            return Err(SevenError::UnsupportedFormat(extension));
        }
        command.arg("--profile").arg(profile);
    } else {
        command.arg("--flavour").arg(flavour);
    }

    let output = command
        .arg(input)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| SevenError::Operation(error.to_string()))?;

    if output.stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(SevenError::Operation(if stderr.is_empty() {
            format!("veraPDF encerrou sem relatório (código {:?})", output.status.code())
        } else {
            stderr
        }));
    }

    let report: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| SevenError::Operation(format!("Relatório JSON do veraPDF inválido: {error}")))?;
    let validation = find_validation_report(&report)
        .ok_or_else(|| SevenError::Operation("veraPDF não retornou validationReport".into()))?;

    let details = validation.get("details").and_then(Value::as_object);
    let mut failures = Vec::new();
    collect_failures(&report, &mut failures);
    failures.sort_by(|left, right| {
        left.specification
            .cmp(&right.specification)
            .then_with(|| left.clause.cmp(&right.clause))
            .then_with(|| left.test_number.cmp(&right.test_number))
    });
    failures.dedup_by(|left, right| {
        left.specification == right.specification
            && left.clause == right.clause
            && left.test_number == right.test_number
            && left.description == right.description
    });

    Ok(IsoValidationReport {
        profile_name: string_value(validation.get("profileName")),
        statement: string_value(validation.get("statement")),
        compliant: bool_value(validation.get("isCompliant")).unwrap_or(false),
        passed_rules: details.map(|value| usize_value(value.get("passedRules"))).unwrap_or_default(),
        failed_rules: details.map(|value| usize_value(value.get("failedRules"))).unwrap_or_default(),
        passed_checks: details.map(|value| usize_value(value.get("passedChecks"))).unwrap_or_default(),
        failed_checks: details.map(|value| usize_value(value.get("failedChecks"))).unwrap_or_default(),
        failures,
    })
}
