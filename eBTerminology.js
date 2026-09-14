// eB Governance presentation terminology.
// Keep persistence/schema terminology stable while exposing generic governance language in the UI.

const replacements = new Map([
    ['Holon Type', 'Node Type'],
    ['Holon Type ID', 'Node Type ID'],
    ['Parent Holon', 'Parent Node'],
    ['Parent Holon ID', 'Parent Node ID'],
    ['Source Holon', 'Source Node'],
    ['Source Holon ID', 'Source Node ID'],
    ['Target Holon', 'Target Node'],
    ['Target Holon ID', 'Target Node ID'],
    ['Edit Holon', 'Edit Node'],
    ['Select a Holon to inspect its properties.', 'Select a node to inspect its properties.'],
    ['(unnamed Holon)', '(unnamed Node)'],
]);

function translateText(text)
{
    let translated = text;

    for (const [from, to] of replacements)
    {
        translated = translated.replaceAll(from, to);
    }

    return translated;
}

function translateElement(root)
{
    if (!root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];

    while (walker.nextNode())
    {
        textNodes.push(walker.currentNode);
    }

    for (const node of textNodes)
    {
        const next = translateText(node.nodeValue || '');
        if (next !== node.nodeValue) node.nodeValue = next;
    }

    for (const element of root.querySelectorAll?.('[aria-label], [title], [placeholder]') || [])
    {
        for (const attribute of ['aria-label', 'title', 'placeholder'])
        {
            if (!element.hasAttribute(attribute)) continue;
            const value = element.getAttribute(attribute) || '';
            const next = translateText(value);
            if (next !== value) element.setAttribute(attribute, next);
        }
    }
}

export function initTerminology()
{
    const inspector = document.getElementById('holonInspector');
    if (!inspector) return;

    translateElement(inspector);

    const observer = new MutationObserver(() => translateElement(inspector));
    observer.observe(inspector, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['aria-label', 'title', 'placeholder'],
    });
}
