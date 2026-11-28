use discatelier_application::LibraryService;
use discatelier_contracts::{AppError, LibraryCopy, LibraryQuery, OpticalBinding, OpticalMedium};
use discatelier_storage::SqliteLibrary;

// Only remove the physical description verified on the disc. A sequel or a
// second edition sharing a title prefix is insufficient evidence for a binding.
fn same_work(disc: &str, title: &str) -> bool {
    let title = title.trim();
    if title.is_empty() {
        return false;
    }
    let disc = disc.trim();
    if disc.eq_ignore_ascii_case(title) {
        return true;
    }
    // The authored title can end with whitespace-separated format descriptors.
    let mut work = disc;
    while let Some((prefix, word)) = work.rsplit_once(char::is_whitespace) {
        if !["本編DISC", "Blu-ray"]
            .iter()
            .any(|descriptor| word.eq_ignore_ascii_case(descriptor))
        {
            break;
        }
        work = prefix.trim_end();
        if work.eq_ignore_ascii_case(title) {
            return true;
        }
    }
    false
}

pub fn matches_copy(
    service: &LibraryService<SqliteLibrary>,
    disc: &str,
    copy: &LibraryCopy,
) -> Result<bool, AppError> {
    if copy.edition.category_id != "video"
        || !copy.edition.media.iter().any(|m| m.carrier_id == "bd")
    {
        return Ok(false);
    }
    if same_work(disc, &copy.edition.title) {
        return Ok(true);
    }
    let work = service
        .video_metadata(&copy.edition_id)?
        .and_then(|metadata| metadata.work);
    Ok(work.is_some_and(|w| same_work(disc, &w.original_title) || same_work(disc, &w.title)))
}

pub fn associate(
    service: &mut LibraryService<SqliteLibrary>,
    medium: &OpticalMedium,
) -> Result<Option<OpticalBinding>, AppError> {
    let Some(title) = medium.disc_title.as_deref() else {
        return Ok(None);
    };
    let mut matched = None;
    let copies = service
        .list(LibraryQuery {
            category_id: "video".into(),
            status: Some("owned".into()),
            query: String::new(),
        })?
        .copies;
    for copy in copies {
        if matches_copy(service, title, &copy)? {
            if matched.is_some() {
                return Ok(None);
            }
            matched = Some(copy);
        }
    }
    let Some(copy) = matched else { return Ok(None) };
    let discs = service.edition_discs(&copy.edition_id)?;
    let key = match discs.as_slice() {
        [disc] if copy.edition.media.len() == 1 => Some(disc.key.as_str()),
        _ => None,
    };
    service.save_optical_disc_binding(&medium.token, &copy.id, title, key)?;
    service.optical_binding(&medium.token)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn feature_disc_matches_the_whole_work_title() {
        assert!(same_work("君の名は。　本編DISC Blu-ray", "君の名は。"));
        assert!(same_work("君の名は。", "君の名は。"));
        assert!(!same_work("君の名は。2　本編DISC Blu-ray", "君の名は。"));
        assert!(!same_work("君の名は。　本編DISC Blu-ray", ""));
    }
}
