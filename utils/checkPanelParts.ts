export const checkPanelParts = async (parts:any) => {
    const [name, description, color, thumbnail] = parts;
    const errors: string[] = [];

    if (!name || !description) {
        errors.push('Panel name and description are required.')
    }

    if (name.length > 256) {
        errors.push('Panel name must be less than 256 characters.');
    }

    if (description.length > 4096) {
        // is this even possible in a normal chat?? xD
        errors.push('Panel description must be less than 4,096 characters.');
    }

    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
        errors.push('Panel color is invalid, please use HEX format (e.g. #784FC9)');
    }

    if (thumbnail) {
        try {
            const url = new URL(thumbnail);

            if (!['http:', 'https:'].includes(url.protocol)) {
                errors.push('Thumbnail must use HTTP or HTTPS.');
            }
        } catch {
            errors.push('Invalid thumbnail URL. Please provide a valid URL!');
        }
    }

    return {
        name, description, color, thumbnail,
        errors
    };
}