export type EmbedField = {
    name: string;
    value: string;
}

export const paginateFields = (
    fields: EmbedField[],
    reserved: {
        title: string,
        description: string,
        footerText: string
    },
    maxFields = 10
): EmbedField[][] => {
    let pages: EmbedField[][] = [];
    let currentPage: EmbedField[] = [];
    let currentCharacters = reserved.description.length + reserved.footerText.length + reserved.title.length;

    for (const field of fields) {
        const chunks: string[] = [];

        for (let i = 0; i < field.value.length; i += 1024) {
            chunks.push(
                field.value.slice(i, i + 1024)
            );
        }

        for (let i = 0; i < chunks.length; i++) {
            const nextField = {
                name: i === 0
                    ? field.name.slice(0, 256)
                    : `${field.name.slice(0, 240)} (continued)`,
                value: chunks[i]!
            }

            const fieldCharacters = nextField.name.length + nextField.value?.length;

            if (
                currentPage.length >= maxFields
                || currentCharacters + fieldCharacters > 6000
            ) {
                pages.push(currentPage);
                currentPage = [];
                currentCharacters = reserved.description.length + reserved.footerText.length + reserved.title.length;
            }

            currentPage.push(nextField);
            currentCharacters += fieldCharacters;
        }
    }

    if (currentPage.length > 0) {
        pages.push(currentPage);
    }

    return pages;
}